import base64, json, pathlib
d = pathlib.Path(__file__).parent
b = lambda f: base64.b64encode((d / 'media' / f).read_bytes()).decode()
import sys
name = sys.argv[1] if len(sys.argv) > 1 else 'concepts'
s = (d / f'{name}.src.html').read_text()
s = (s.replace('__FILM__', b('film.mp4')).replace('__BRIDGE__', b('bridge.mp4'))
      .replace('__SPRITE__', b('sprite.jpg')).replace('__STILL__', b('still.jpg') if (d / 'media' / 'still.jpg').exists() else '').replace('__BSPRITE__', b('bridge-sprite.jpg'))
      .replace('__AUDIO__', (d / 'media' / 'audio.json').read_text()))
(d / f'{name}.html').write_text(s)
print(round(len(s) / 1e6, 2), 'MB')
