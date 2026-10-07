const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

// Exercise the CLI callback without executing git or loading legacy dependencies.
function runCli (options, fixture) {
  fixture = fixture || {}
  const result = { stdout: [], stderr: [], writes: [], commands: [] }
  const defaults = {}
  let run
  let completion

  const command = {
    option (name, settings) {
      if (typeof settings === 'object') defaults[name] = settings.default
    }
  }
  const modules = {
    fs: {
      existsSync: () => fixture.existing !== undefined,
      readFileSync: () => Buffer.from(fixture.existing),
      writeFileSync: (file, text) => result.writes.push({ file, text })
    },
    path,
    child_process: {
      exec (command, callback) {
        result.commands.push(command)
        if (fixture.error) return callback(fixture.error)
        callback(null, command === 'git tag'
          ? (fixture.tags === undefined ? '1.0.0\n' : fixture.tags)
          : (fixture.commits === undefined
            ? 'abc1234 added a feature\ndef5678 chore cleanup\n'
            : fixture.commits))
      }
    },
    // Tag parsing and sorting are outside the stdout regression's scope.
    'is-semver': tag => tag === '1.0.0',
    'semver-sort': { desc: tags => tags },
    cac: () => ({
      command (name, description, callback) {
        run = callback
        return command
      },
      parse () {
        completion = run([], Object.assign({}, defaults, options))
      }
    })
  }

  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
    .replace(/^#!.*\n/, '')
  vm.runInNewContext(source, {
    require (name) {
      assert(Object.prototype.hasOwnProperty.call(modules, name))
      return modules[name]
    },
    console: {
      log: value => result.stdout.push(value),
      error: error => result.stderr.push(error)
    },
    Date: function () { return new Date('2026-10-07T12:00:00Z') }
  })
  return completion.then(() => result)
}

test('stdout prints formatted commits instead of a function', async () => {
  const result = await runCli({ stdout: true })
  assert.deepStrictEqual(result.stdout, [
    '- [abc1234](../../commit/abc1234) added a feature \n'
  ])
  assert.strictEqual(result.writes.length, 0)
  assert.strictEqual(result.stderr.length, 0)
  assert.deepStrictEqual(result.commands, [
    'git tag', 'git log --no-merges --oneline 1.0.0..HEAD'
  ])
})

test('stdout respects the requested commit pattern', async () => {
  const result = await runCli({ stdout: true, pattern: 'chore' })
  assert.deepStrictEqual(result.stdout, [
    '- [def5678](../../commit/def5678) chore cleanup \n'
  ])
  assert.strictEqual(result.writes.length, 0)
})

test('stdout takes precedence over title and output options', async () => {
  const result = await runCli({
    stdout: true, title: 'Custom title', output: 'custom.md'
  }, { existing: 'Existing changelog' })
  assert.deepStrictEqual(result.stdout, [
    '- [abc1234](../../commit/abc1234) added a feature \n'
  ])
  assert.strictEqual(result.writes.length, 0)
})

test('stdout preserves multiple matching commits in git order', async () => {
  const result = await runCli({ stdout: true }, {
    commits: 'abc1234 fixed first\ndef5678 added second\n'
  })
  assert.deepStrictEqual(result.stdout, [
    '- [abc1234](../../commit/abc1234) fixed first \n' +
    '- [def5678](../../commit/def5678) added second \n'
  ])
})

test('stdout prints an empty string when no commits match', async () => {
  const result = await runCli({ stdout: true, pattern: 'unmatched' })
  assert.deepStrictEqual(result.stdout, [''])
  assert.strictEqual(result.writes.length, 0)
})

test('stdout handles an empty git log', async () => {
  const result = await runCli({ stdout: true }, { commits: '' })
  assert.deepStrictEqual(result.stdout, [''])
  assert.strictEqual(result.writes.length, 0)
})

test('default file output retains its title, date and formatted commits', async () => {
  const result = await runCli({})
  assert.strictEqual(result.stdout.length, 0)
  assert.strictEqual(result.writes.length, 1)
  assert.strictEqual(result.writes[0].file, 'CHANGELOG.md')
  assert.strictEqual(result.writes[0].text,
    '\n## 1.0.0\n> Wed, 07 Oct 2026 12:00:00 GMT\n' +
    '-'.repeat(80) + '\n\n' +
    '- [abc1234](../../commit/abc1234) added a feature \n')
})

test('custom file output prepends to an existing changelog', async () => {
  const result = await runCli({
    title: 'Custom title', output: 'custom.md'
  }, { existing: 'Existing changelog' })
  assert.strictEqual(result.stdout.length, 0)
  assert.strictEqual(result.writes[0].file, 'custom.md')
  assert.strictEqual(result.writes[0].text,
    '\n## Custom title\n> Wed, 07 Oct 2026 12:00:00 GMT\n' +
    '-'.repeat(80) + '\n\n' +
    '- [abc1234](../../commit/abc1234) added a feature \n' +
    '\n\nExisting changelog')
})

test('git failures keep their error reporting and do not write output', async () => {
  const error = new Error('git fixture failed')
  const result = await runCli({ stdout: true }, { error })
  assert.deepStrictEqual(result.stderr, [error])
  assert.strictEqual(result.stdout.length, 0)
  assert.strictEqual(result.writes.length, 0)
})

test('missing semver tags keep their error reporting', async () => {
  const result = await runCli({ stdout: true }, { tags: '' })
  assert.strictEqual(result.stderr.length, 1)
  assert.strictEqual(result.stderr[0].message, 'No previous semver tag found')
  assert.strictEqual(result.stdout.length, 0)
  assert.strictEqual(result.writes.length, 0)
})

