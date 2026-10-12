import sys
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else '.')
import gen
mods = []
for name in ('pack1', 'pack2', 'pack3', 'pack4'):
    try:
        mods.append(__import__(name))
    except ImportError:
        pass
for m in mods:
    m.build(gen.Canvas, gen.emit)
gen.write()
