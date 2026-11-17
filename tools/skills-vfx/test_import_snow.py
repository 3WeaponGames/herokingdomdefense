"""The native snow sprite is the original procedural glow, not an upscaled field."""
import importlib.util, io, math
from pathlib import Path
import unittest
from PIL import Image
spec=importlib.util.spec_from_file_location('snow_import',Path(__file__).with_name('import-snow.py'))
snow=importlib.util.module_from_spec(spec);spec.loader.exec_module(snow)

class SnowTextureTests(unittest.TestCase):
    def test_original_p4_shader_equation_is_sampled_per_texel(self):
        image=Image.open(io.BytesIO(snow.glow(128,4,0,1.5,2)))
        self.assertEqual(image.size,(128,128));self.assertEqual(image.mode,'RGBA')
        for x,y in [(0,0),(0,64),(32,64),(48,64),(63,63),(80,71)]:
            u,v=(x+.5)/128-.5,(y+.5)/128-.5
            glow=max(0,1-4*(u*u+v*v))**4
            expected=round(min(1,min(2,1.5*glow)*min(1,30*glow))*255)
            self.assertEqual(image.getpixel((x,y)),(255,255,255,expected))
        self.assertEqual(image.getpixel((0,0))[3],0)
        self.assertEqual(image.getpixel((63,63))[3],255)

    def test_round_soft_shape_is_symmetric_and_reproducible(self):
        a=snow.glow(128,4,0,1.5,2);self.assertEqual(a,snow.glow(128,4,0,1.5,2))
        image=Image.open(io.BytesIO(a))
        for x,y in [(12,47),(50,93),(81,14)]:
            self.assertEqual(image.getpixel((x,y)),image.getpixel((127-x,y)))
            self.assertEqual(image.getpixel((x,y)),image.getpixel((y,x)))

if __name__=='__main__':unittest.main()
