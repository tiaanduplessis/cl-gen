'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const util = require('util')
const cac = require('cac')

const args = JSON.parse(process.argv[2])
const scenario = process.argv[3] || 'normal'
// Let runtime startup warnings flush before capturing CLI output.
setImmediate(() => {
  const result = { stdout: '', stderr: '', writes: [], commands: [] }
  const output = process.stdout.write.bind(process.stdout)
  process.stdout.write = text => { result.stdout += text; return true }
  console.log = (...values) => { result.stdout += util.format(...values) + '\n' }
  console.error = (...values) => { result.stderr += util.format(...values) + '\n' }
  process.argv = [process.execPath, 'cl-gen'].concat(args)

  // The parser and package metadata discovery are real. Changelog dependencies,
  // git and filesystem operations use fixtures so tests never run external git.
  const modules = {
    path,
    fs: {
      existsSync: () => false,
      readFileSync: () => { throw new Error('Unexpected file read') },
      writeFileSync: (file, text) => result.writes.push({ file, text })
    },
    'is-semver': tag => tag === '1.0.0',
    'semver-sort': { desc: tags => tags },
    child_process: {
      exec (command, callback) {
        result.commands.push(command)
        process.nextTick(() => {
          if (scenario === 'git-error' ||
            (scenario === 'log-error' && command !== 'git tag')) {
            return callback(new Error('controlled git failure'))
          }
          callback(null, command === 'git tag'
            ? (scenario === 'no-tags' ? '' : '1.0.0\n')
            : 'abc1234 added a feature\ndef5678 chore cleanup\n')
        })
      }
    },
    cac
  }

  const source = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8')
    .replace(/^#!.*\n/, '')
  vm.runInNewContext(source, {
    require (name) {
      if (!Object.prototype.hasOwnProperty.call(modules, name)) {
        throw new Error('Unexpected require: ' + name)
      }
      return modules[name]
    },
    console,
    Date: function () { return new Date('2026-10-07T12:00:00Z') }
  })

  setImmediate(() => {
    result.exitCode = process.exitCode || 0
    process.exitCode = 0
    output(JSON.stringify(result))
  })
})
