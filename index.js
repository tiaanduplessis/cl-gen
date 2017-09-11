#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const exec = require('child_process').exec

const isSemver = require('is-semver')
const semverSort = require('semver-sort')
const cac = require('cac')

const cli = cac()

const defaultCommand = cli.command('*', 'Generate a new changelog', run)

defaultCommand.option('title', 'The title of the changelog')
defaultCommand.option('pattern', {
  desc:
    'Regular expression to match commit messages to be included in the changelog',
  default: '(added|removed|changed|fixed)'
})
defaultCommand.option('stdout', 'Will print results to stdout')
defaultCommand.option('output', {
  desc: 'File to write changelog to',
  default: 'CHANGELOG.md'
})

cli.parse()

async function run (input, { stdout, title, output, pattern }) {
  const commitRe = new RegExp(pattern)

  try {
    const tag = await getLatestTag()
    const commits = (await getCommits(tag)).filter(commit =>
      commitRe.test(commit)
    )
    const formattedCommits = formatCommits(commits)

    if (stdout) {
      console.log(formatCommits)
      return
    }

    writeFile(title || tag, formattedCommits, output)
  } catch (error) {
    console.error(error)
  }
}

function formatCommits (commits = []) {
  return commits
    .map(
      commit =>
        `- ${commit.replace(/^([a-f|0-9]+)/, '[$1](../../commit/$1)')} \n`
    )
    .join('')
}

function getLatestTag () {
  return new Promise((resolve, reject) => {
    exec('git tag', (error, stdout) => {
      if (error) {
        return reject(error)
      }

      const tag = semverSort.desc(stdout.split('\n').filter(isSemver))[0]

      if (!tag) {
        return reject(new Error('No previous semver tag found'))
      }

      resolve(tag)
    })
  })
}

function writeFile (title, log, outputFile) {
  const formattedTitle = `\n## ${title}\n> ${new Date().toUTCString()}\n`
  const ruler = '-'.repeat(80)
  let result = `${formattedTitle}${ruler}\n\n`
  result += log

  // Append existing log
  if (fs.existsSync(outputFile)) {
    result += `\n\n${fs.readFileSync(outputFile).toString()}`
  }

  fs.writeFileSync(outputFile, result)
}

function getCommits (tag) {
  return new Promise((resolve, reject) => {
    exec(`git log --no-merges --oneline ${tag}..HEAD`, (error, stdout) => {
      if (error) {
        return reject(error)
      }
      resolve(stdout.split('\n'))
    })
  })
}
