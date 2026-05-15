'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  BufferGeometry,
  Material,
  Matrix4,
  Object3D,
  WebGLRenderer,
} from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { cn } from '@/lib/utils'

interface WireframeModelPreviewProps {
  src?: string | null
  className?: string
  label: string
  loadingLabel: string
  errorLabel: string
}

export function WireframeModelPreview({
  src,
  className,
  label,
  loadingLabel,
  errorLabel,
}: WireframeModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(
    src ? 'loading' : 'ready',
  )
  const [progressPercent, setProgressPercent] = useState(0)

  useEffect(() => {
    let disposed = false
    let frameId = 0
    let renderer: WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let resizeObserver: ResizeObserver | null = null
    const geometries: BufferGeometry[] = []
    const materials: Material[] = []
    const container = containerRef.current

    if (!container) return
    setState(src ? 'loading' : 'ready')
    setProgressPercent(0)

    void (async () => {
      try {
        const THREE = await import('three')
        const { GLTFLoader } =
          await import('three/examples/jsm/loaders/GLTFLoader.js')
        const { OrbitControls: OrbitControlsClass } =
          await import('three/examples/jsm/controls/OrbitControls.js')

        if (disposed) return

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x101010)

        const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100)
        camera.position.set(0, 0.08, 4.6)

        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(renderer.domElement)

        controls = new OrbitControlsClass(camera, renderer.domElement)
        controls.enableDamping = true
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.8
        controls.enablePan = false
        controls.minDistance = 1.5
        controls.maxDistance = 8

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.75)
        scene.add(ambientLight)

        const modelRoot = new THREE.Group()
        const wireGroup = new THREE.Group()
        const sampledPoints: Array<[number, number, number]> = []
        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0xf4f4f4,
          transparent: true,
          opacity: 0.72,
        })
        materials.push(lineMaterial)

        const addWireGeometry = (
          geometry: BufferGeometry,
          matrix?: Matrix4,
        ) => {
          const wireGeometry = new THREE.WireframeGeometry(geometry)
          if (matrix) wireGeometry.applyMatrix4(matrix)
          const wire = new THREE.LineSegments(wireGeometry, lineMaterial)
          geometries.push(wireGeometry)
          wireGroup.add(wire)
        }

        const sampleGeometry = (geometry: BufferGeometry, matrix?: Matrix4) => {
          const position = geometry.getAttribute('position')
          if (!position) return

          const point = new THREE.Vector3()
          const sampleStep = Math.max(1, Math.floor(position.count / 2500))
          for (let i = 0; i < position.count; i += sampleStep) {
            point.fromBufferAttribute(position, i)
            if (matrix) point.applyMatrix4(matrix)
            sampledPoints.push([point.x, point.y, point.z])
          }
        }

        const addPlaceholderGeometry = (geometry: BufferGeometry) => {
          addWireGeometry(geometry)
          geometry.dispose()
        }

        if (src) {
          const gltf = await new Promise<{
            scene: Object3D
          }>((resolve, reject) => {
            new GLTFLoader().load(
              src,
              resolve,
              (event) => {
                if (!event.total) {
                  setProgressPercent((current) => Math.max(current, 35))
                  return
                }
                const loaded = Math.round((event.loaded / event.total) * 100)
                setProgressPercent(Math.min(95, loaded))
              },
              reject,
            )
          })
          if (disposed) return

          gltf.scene.updateMatrixWorld(true)
          gltf.scene.traverse((object: Object3D) => {
            if (!(object instanceof THREE.Mesh)) return
            const worldMatrix = object.matrixWorld.clone()
            sampleGeometry(object.geometry, worldMatrix)
            addWireGeometry(object.geometry, worldMatrix)
          })
        } else {
          addPlaceholderGeometry(new THREE.SphereGeometry(0.42, 16, 10))
          wireGroup.children.at(-1)?.position.set(0, 1.18, 0)
          addPlaceholderGeometry(
            new THREE.CylinderGeometry(0.34, 0.48, 1.8, 14, 8, true),
          )
          addPlaceholderGeometry(new THREE.BoxGeometry(1.2, 0.08, 0.08))
          wireGroup.children.at(-1)?.position.set(0, 0.35, 0)
          addPlaceholderGeometry(new THREE.BoxGeometry(0.92, 0.18, 0.7))
          wireGroup.children.at(-1)?.position.set(0, -1.05, 0)
        }

        if (wireGroup.children.length === 0) {
          setState('error')
          return
        }

        const sortedQuantile = (values: number[], q: number) => {
          if (values.length === 0) return 0
          values.sort((a, b) => a - b)
          const index = Math.min(
            values.length - 1,
            Math.max(0, Math.round((values.length - 1) * q)),
          )
          return values[index]
        }

        let center: InstanceType<typeof THREE.Vector3>
        let size: InstanceType<typeof THREE.Vector3>

        if (sampledPoints.length >= 20) {
          const xs = sampledPoints.map(([x]) => x)
          const ys = sampledPoints.map(([, y]) => y)
          const zs = sampledPoints.map(([, , z]) => z)
          const left = sortedQuantile([...xs], 0.05)
          const right = sortedQuantile([...xs], 0.95)
          const bottom = sortedQuantile([...ys], 0.02)
          const top = sortedQuantile([...ys], 0.98)
          const back = sortedQuantile([...zs], 0.05)
          const front = sortedQuantile([...zs], 0.95)

          center = new THREE.Vector3(
            sortedQuantile([...xs], 0.5),
            (bottom + top) / 2,
            sortedQuantile([...zs], 0.5),
          )
          size = new THREE.Vector3(
            Math.max(right - left, 0.01),
            Math.max(top - bottom, 0.01),
            Math.max(front - back, 0.01),
          )
        } else {
          const box = new THREE.Box3().setFromObject(wireGroup)
          center = box.getCenter(new THREE.Vector3())
          size = box.getSize(new THREE.Vector3())
        }

        const maxDimension = Math.max(size.x, size.y, size.z)
        if (maxDimension > 0) {
          wireGroup.position.set(-center.x, -center.y, -center.z)
          modelRoot.scale.setScalar(1.85 / maxDimension)
        }
        modelRoot.add(wireGroup)
        scene.add(modelRoot)
        controls.target.set(0, 0, 0)
        camera.lookAt(0, 0, 0)
        setState('ready')
        setProgressPercent(100)

        const resize = () => {
          if (!renderer) return
          const width = container.clientWidth
          const height = container.clientHeight
          if (width <= 0 || height <= 0) return
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height, false)
        }

        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(container)
        resize()

        const animate = () => {
          if (disposed || !renderer) return
          controls?.update()
          renderer.render(scene, camera)
          frameId = window.requestAnimationFrame(animate)
        }
        animate()
      } catch {
        if (!disposed) setState('error')
      }
    })()

    return () => {
      disposed = true
      if (frameId) window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      controls?.dispose()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      if (renderer) {
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
  }, [src])

  return (
    <div
      className={cn(
        'relative size-full overflow-hidden rounded-xl bg-neutral-950',
        className,
      )}
      aria-label={label}
    >
      <div ref={containerRef} className="size-full" />
      {state !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/90 text-sm text-neutral-300">
          {state === 'loading'
            ? progressPercent > 0
              ? `${loadingLabel} ${progressPercent}%`
              : loadingLabel
            : errorLabel}
        </div>
      )}
    </div>
  )
}
