const assert = require('assert')
const path = require('path')
const spawnSync = require('child_process').spawnSync

function run (args, scenario) {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'fixtures/cli-runner.js'), JSON.stringify(args),
    scenario || 'normal'
  ], {
    encoding: 'utf8', timeout: 5000,
    env: Object.assign({}, process.env, { FORCE_COLOR: '0' })
  })
  assert.strictEqual(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

const formatted = '- [abc1234](../../commit/abc1234) added a feature \n\n'

for (const args of [
  ['--stdout'], ['--stdout=true'], ['--stdout=false'], ['--stdout', 'false'],
  ['--stdout', '--stdout'], ['--stdout', '--title', 'Release', '--output', 'custom.md'],
  ['positional', '--stdout'], ['one', 'two', '--stdout'], ['--stdout', 'positional'],
  ['*', '--stdout']
]) {
  test('real parser keeps stdout behavior for ' + JSON.stringify(args), () => {
    const result = run(args)
    assert.strictEqual(result.stdout, formatted)
    assert.strictEqual(result.stderr, '')
    assert.strictEqual(result.writes.length, 0)
    assert.strictEqual(result.exitCode, 0)
  })
}

for (const args of [[], ['--no-stdout'], ['positional'], ['one', 'two'], ['--', '--stdout']]) {
  test('real parser keeps default file output for ' + JSON.stringify(args), () => {
    const result = run(args)
    assert.strictEqual(result.stdout, '')
    assert.strictEqual(result.writes.length, 1)
    assert.strictEqual(result.writes[0].file, 'CHANGELOG.md')
    assert(result.writes[0].text.includes('## 1.0.0'))
    assert(result.writes[0].text.includes('added a feature'))
  })
}

for (const args of [['--help'], ['-h'], ['one', '--help'], ['*', '--help']]) {
  test('real parser keeps complete help for ' + JSON.stringify(args), () => {
    const result = run(args)
    for (const flag of ['--title', '--pattern', '--stdout', '--output', '--help', '--version']) {
      assert(result.stdout.includes(flag), 'Missing help option: ' + flag)
    }
    assert(result.stdout.includes('CHANGELOG.md'))
    assert(result.stdout.includes('(added|removed|changed|fixed)'))
    assert(result.stdout.includes('cl-gen'))
    assert.strictEqual(result.commands.length, 0)
    assert.strictEqual(result.writes.length, 0)
  })
}

for (const args of [['--version'], ['-v']]) {
  test('real parser discovers package version for ' + JSON.stringify(args), () => {
    const result = run(args)
    assert.strictEqual(result.stdout, require('../package.json').version + '\n')
    assert.strictEqual(result.commands.length, 0)
    assert.strictEqual(result.writes.length, 0)
  })
}

test('real parser keeps title and output values', () => {
  for (const args of [
    ['--title', 'Release', '--output', 'custom.md'],
    ['--title=Release', '--output=custom.md']
  ]) {
    const result = run(args)
    assert.strictEqual(result.writes[0].file, 'custom.md')
    assert(result.writes[0].text.includes('## Release'))
  }
})

test('real parser keeps custom patterns and unmatched output', () => {
  const custom = run(['--stdout', '--pattern', 'chore'])
  assert.strictEqual(custom.stdout, '- [def5678](../../commit/def5678) chore cleanup \n\n')
  assert.strictEqual(run(['--stdout', '--pattern=absent']).stdout, '\n')
})

test('real parser reports an invalid regular expression', () => {
  const result = run(['--stdout', '--pattern', '['])
  assert(result.stderr.includes('SyntaxError: Invalid regular expression'))
  assert.strictEqual(result.exitCode, 1)
  assert.strictEqual(result.stdout, '')
  assert.strictEqual(result.commands.length, 0)
  assert.strictEqual(result.writes.length, 0)
})

for (const scenario of ['git-error', 'log-error', 'no-tags']) {
  test('real parser preserves error reporting for ' + scenario, () => {
    const result = run(['--stdout'], scenario)
    assert(result.stderr.includes(scenario === 'no-tags'
      ? 'No previous semver tag found' : 'controlled git failure'))
    assert.strictEqual(result.stdout, '')
    assert.strictEqual(result.writes.length, 0)
    assert.strictEqual(result.exitCode, 0)
  })
}
