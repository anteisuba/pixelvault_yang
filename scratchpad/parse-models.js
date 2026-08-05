const fs = require('fs')
const path = require('path')
const files = ['image','video','audio','model-3d'].map(f => 'C:/project/pixelvault_yang/src/constants/models/'+f+'.ts')
for (const file of files) {
  const t = fs.readFileSync(file,'utf8')
  console.log('\n===', path.basename(file), '===')
  const re = /id:\s*AI_MODELS\.(\w+)[\s\S]*?adapterType:\s*AI_ADAPTER_TYPES\.(\w+)[\s\S]*?externalModelId:\s*['"]([^'"]+)['"][\s\S]*?available:\s*(true|false)/g
  let m
  while ((m = re.exec(t))) {
    console.log([m[4]==='true'?'ON':'OFF', m[2], m[1], m[3]].join(' | '))
  }
}
