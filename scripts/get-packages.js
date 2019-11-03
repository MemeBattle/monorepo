// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs').promises
// eslint-disable-next-line @typescript-eslint/no-var-requires
const classicFs = require('fs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')

const hasFile = async filePath => {
  try {
    await fs.access(filePath, classicFs.constants.R_OK)
    return true
  } catch (e) {
    return false
  }
}

const getPackages = async packagesFolder => {
  const packageNames = []

  const getPackageNames = async folderName => {
    if ((await fs.lstat(folderName)).isFile()) {
      return
    }

    if (await hasFile(`${folderName}/package.json`)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const packageJson = require(`${folderName}/package.json`)
      packageNames.push(packageJson.name.split('/')[1])
      return
    }

    const filesInFolder = await fs.readdir(folderName)

    for (const file of filesInFolder) {
      const folder = path.resolve(folderName, file)
      await getPackageNames(folder)
    }
  }

  await getPackageNames(packagesFolder)

  return packageNames.join(',')
}

;(async () => {
  try {
    console.log(`@memebattle/{${await getPackages(process.argv[2] || '../packages')}}`)
  } catch (err) {
    console.log('Error: ', err)
  }
})()
