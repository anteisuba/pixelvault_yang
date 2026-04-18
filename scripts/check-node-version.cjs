const REQUIRED_MAJOR = 22
const currentVersion = process.version
const currentMajor = Number.parseInt(currentVersion.slice(1).split('.')[0], 10)

if (currentMajor !== REQUIRED_MAJOR) {
  console.error(
    [
      `This project requires Node.js ${REQUIRED_MAJOR}.x.`,
      `Current version: ${currentVersion}`,
      'Switch to Node 22 before running dev, build, lint, or tests.',
      'See .nvmrc for the expected runtime.',
    ].join('\n'),
  )

  process.exit(1)
}
