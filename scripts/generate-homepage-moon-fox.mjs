import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const OUTPUT_DIR = path.join(
  PROJECT_ROOT,
  'public',
  'homepage',
  'production',
  'model3d',
)
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'moon-lantern-fox-v1.glb')

class NodeFileReader {
  result = null
  onloadend = null
  onerror = null

  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer()
      this.onloadend?.()
    } catch (error) {
      this.onerror?.(error)
    }
  }

  async readAsDataURL(blob) {
    try {
      const bytes = Buffer.from(await blob.arrayBuffer())
      this.result = `data:${blob.type};base64,${bytes.toString('base64')}`
      this.onloadend?.()
    } catch (error) {
      this.onerror?.(error)
    }
  }
}

globalThis.FileReader ??= NodeFileReader

const scene = new THREE.Scene()
scene.name = 'Moon Lantern Fox'
scene.userData = {
  title: 'Moon Lantern Fox',
  author: 'PixelVault',
  source: 'Original procedural homepage asset',
  version: 1,
}

const root = new THREE.Group()
root.name = 'MoonLanternFox'
scene.add(root)

const materials = {
  fur: new THREE.MeshStandardMaterial({
    name: 'Midnight teal fur',
    color: 0x164d5d,
    roughness: 0.82,
    metalness: 0,
  }),
  furDark: new THREE.MeshStandardMaterial({
    name: 'Deep teal markings',
    color: 0x0b3241,
    roughness: 0.86,
    metalness: 0,
  }),
  cream: new THREE.MeshStandardMaterial({
    name: 'Warm cream fur',
    color: 0xf1d5a3,
    roughness: 0.84,
    metalness: 0,
  }),
  coral: new THREE.MeshStandardMaterial({
    name: 'Coral ear accent',
    color: 0xd98170,
    roughness: 0.78,
    metalness: 0,
  }),
  eye: new THREE.MeshPhysicalMaterial({
    name: 'Glossy navy eyes',
    color: 0x071525,
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  }),
  iris: new THREE.MeshPhysicalMaterial({
    name: 'Blue iris',
    color: 0x2b5e86,
    roughness: 0.18,
    metalness: 0,
    clearcoat: 0.7,
  }),
  white: new THREE.MeshStandardMaterial({
    name: 'Eye highlights',
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0,
  }),
  nose: new THREE.MeshStandardMaterial({
    name: 'Nose and mouth',
    color: 0x241a20,
    roughness: 0.38,
    metalness: 0,
  }),
  gold: new THREE.MeshStandardMaterial({
    name: 'Moon lantern glow',
    color: 0xffcb70,
    emissive: 0xff9f35,
    emissiveIntensity: 1.7,
    roughness: 0.42,
    metalness: 0,
  }),
}

function addMesh(
  name,
  geometry,
  material,
  position,
  scale = [1, 1, 1],
  rotation = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.scale.set(...scale)
  mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
  return mesh
}

const sphere = new THREE.SphereGeometry(1, 48, 32)
const pawSphere = new THREE.SphereGeometry(1, 32, 24)

addMesh('Body', sphere, materials.fur, [0, 0.85, 0], [0.82, 1.08, 0.7])
addMesh('Head', sphere, materials.fur, [0, 2.2, 0.08], [1.25, 1.03, 0.96])

function makeEarGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.72)
  shape.bezierCurveTo(-0.55, -0.3, -0.58, 0.55, 0, 1.18)
  shape.bezierCurveTo(0.58, 0.55, 0.55, -0.3, 0, -0.72)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.18,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.07,
    bevelThickness: 0.07,
    curveSegments: 16,
  })
  geometry.center()
  return geometry
}

const earGeometry = makeEarGeometry()
addMesh(
  'Left ear',
  earGeometry,
  materials.fur,
  [-0.83, 3.06, -0.02],
  [0.9, 1.08, 0.95],
  [0, 0, 0.17],
)
addMesh(
  'Right ear',
  earGeometry,
  materials.fur,
  [0.83, 3.06, -0.02],
  [0.9, 1.08, 0.95],
  [0, 0, -0.17],
)
addMesh(
  'Left inner ear',
  earGeometry,
  materials.cream,
  [-0.83, 3.09, 0.11],
  [0.58, 0.76, 0.28],
  [0, 0, 0.17],
)
addMesh(
  'Right inner ear',
  earGeometry,
  materials.cream,
  [0.83, 3.09, 0.11],
  [0.58, 0.76, 0.28],
  [0, 0, -0.17],
)

addMesh(
  'Left coral ear tuft',
  sphere,
  materials.coral,
  [-0.77, 3.08, 0.27],
  [0.18, 0.33, 0.08],
  [0, 0, -0.28],
)
addMesh(
  'Right coral ear tuft',
  sphere,
  materials.coral,
  [0.77, 3.08, 0.27],
  [0.18, 0.33, 0.08],
  [0, 0, 0.28],
)

for (const [index, tuft] of [
  [-0.24, 0.24],
  [0, 0],
  [0.24, -0.24],
].entries()) {
  addMesh(
    `Crown tuft ${index + 1}`,
    new THREE.ConeGeometry(0.13, 0.46, 8),
    materials.fur,
    [tuft[0], 3.2 + Math.abs(tuft[0]) * 0.15, 0.03],
    [1, 1, 0.7],
    [0, 0, tuft[1]],
  )
}

addMesh(
  'Left cheek',
  sphere,
  materials.cream,
  [-0.42, 1.94, 0.84],
  [0.52, 0.31, 0.2],
)
addMesh(
  'Right cheek',
  sphere,
  materials.cream,
  [0.42, 1.94, 0.84],
  [0.52, 0.31, 0.2],
)
addMesh('Chin', sphere, materials.cream, [0, 1.78, 0.74], [0.48, 0.26, 0.18])

for (const side of [-1, 1]) {
  addMesh(
    side < 0 ? 'Left eye' : 'Right eye',
    sphere,
    materials.eye,
    [side * 0.45, 2.3, 0.89],
    [0.3, 0.39, 0.12],
  )
  addMesh(
    side < 0 ? 'Left iris' : 'Right iris',
    sphere,
    materials.iris,
    [side * 0.45, 2.27, 0.985],
    [0.19, 0.28, 0.035],
  )
  addMesh(
    side < 0 ? 'Left eye highlight large' : 'Right eye highlight large',
    sphere,
    materials.white,
    [side * 0.39, 2.43, 1.035],
    [0.075, 0.09, 0.025],
  )
  addMesh(
    side < 0 ? 'Left eye highlight small' : 'Right eye highlight small',
    sphere,
    materials.white,
    [side * 0.52, 2.16, 1.025],
    [0.035, 0.045, 0.018],
  )
}

addMesh(
  'Nose',
  new THREE.SphereGeometry(1, 24, 16),
  materials.nose,
  [0, 1.94, 1.08],
  [0.12, 0.08, 0.07],
)

function addMouthCurve(name, points) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
  )
  addMesh(
    name,
    new THREE.TubeGeometry(curve, 16, 0.018, 8, false),
    materials.nose,
    [0, 0, 0],
  )
}

addMouthCurve('Mouth stem', [
  [0, 1.9, 1.1],
  [0, 1.84, 1.105],
])
addMouthCurve('Left smile', [
  [0, 1.84, 1.105],
  [-0.08, 1.79, 1.1],
  [-0.18, 1.82, 1.075],
])
addMouthCurve('Right smile', [
  [0, 1.84, 1.105],
  [0.08, 1.79, 1.1],
  [0.18, 1.82, 1.075],
])

addMesh(
  'Chest tuft',
  sphere,
  materials.cream,
  [0, 0.98, 0.68],
  [0.53, 0.68, 0.15],
)

for (const side of [-1, 1]) {
  addMesh(
    side < 0 ? 'Left foreleg' : 'Right foreleg',
    new THREE.CapsuleGeometry(0.17, 0.62, 12, 20),
    materials.fur,
    [side * 0.43, 0.48, 0.48],
    [1, 1, 0.9],
    [0, 0, side * -0.08],
  )
  addMesh(
    side < 0 ? 'Left front paw' : 'Right front paw',
    pawSphere,
    materials.cream,
    [side * 0.43, 0.05, 0.58],
    [0.27, 0.18, 0.32],
  )
  addMesh(
    side < 0 ? 'Left haunch' : 'Right haunch',
    sphere,
    materials.furDark,
    [side * 0.63, 0.45, 0.02],
    [0.42, 0.58, 0.52],
  )
  addMesh(
    side < 0 ? 'Left hind paw' : 'Right hind paw',
    pawSphere,
    materials.cream,
    [side * 0.66, 0.02, 0.34],
    [0.3, 0.17, 0.38],
  )
}

const tailCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.58, 0.6, -0.28),
  new THREE.Vector3(1.15, 0.42, -0.2),
  new THREE.Vector3(1.52, 0.72, 0.02),
  new THREE.Vector3(1.48, 1.28, 0.18),
  new THREE.Vector3(1.12, 1.5, 0.32),
  new THREE.Vector3(0.88, 1.25, 0.48),
])
addMesh(
  'Curled tail',
  new THREE.TubeGeometry(tailCurve, 72, 0.31, 20, false),
  materials.fur,
  [0, 0, 0],
)
addMesh(
  'Cream tail tip',
  sphere,
  materials.cream,
  [0.87, 1.26, 0.48],
  [0.39, 0.34, 0.34],
  [0, 0, -0.35],
)

addMesh(
  'Moon medallion',
  new THREE.CircleGeometry(0.24, 48),
  materials.gold,
  [-0.02, 1.04, 0.835],
)
addMesh(
  'Moon cutout',
  new THREE.CircleGeometry(0.2, 48),
  materials.cream,
  [0.085, 1.095, 0.84],
)

const foreheadDiamond = new THREE.Shape()
foreheadDiamond.moveTo(0, 0.16)
foreheadDiamond.lineTo(0.09, 0)
foreheadDiamond.lineTo(0, -0.16)
foreheadDiamond.lineTo(-0.09, 0)
foreheadDiamond.closePath()
addMesh(
  'Forehead star',
  new THREE.ShapeGeometry(foreheadDiamond),
  materials.cream,
  [0, 2.79, 1.01],
)

root.rotation.y = -0.08
root.position.y = 0.06
root.updateMatrixWorld(true)

const exporter = new GLTFExporter()
const arrayBuffer = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: true,
  trs: false,
  includeCustomExtensions: false,
})

await mkdir(OUTPUT_DIR, { recursive: true })
await writeFile(OUTPUT_PATH, Buffer.from(arrayBuffer))

const box = new THREE.Box3().setFromObject(root)
const size = box.getSize(new THREE.Vector3())
const meshCount = root.children.filter((child) => child.isMesh).length

console.log(
  JSON.stringify(
    {
      output: OUTPUT_PATH,
      meshCount,
      bounds: {
        x: Number(size.x.toFixed(3)),
        y: Number(size.y.toFixed(3)),
        z: Number(size.z.toFixed(3)),
      },
      bytes: arrayBuffer.byteLength,
    },
    null,
    2,
  ),
)
