"use strict";
// Generated from the original CFXR snow material and emitters.
module.exports = {
  "version": 1,
  "resource": "vfx/weather/snowflake",
  "uuid": "aa11458e-ccd2-5b2a-b2e2-44ee97ad96a9",
  "width": 128,
  "height": 128,
  "sha256": "f78ae3ce613f7d17713123097defb404dfa6c26085eb181f3449f2517ebc116e",
  "base": {
    "lifeMin": 2.0,
    "lifeMax": 3.0,
    "sizeMin": 0.04,
    "sizeMax": 0.06,
    "fallSpeed": 5.0,
    "shapeWidth": 10,
    "color": 0.9056604
  },
  "profiles": {
    "weather-snow-light": {
      "rate": 49.999996,
      "driftMin": -0.5,
      "driftMax": 0.5
    },
    "weather-snow-dense": {
      "rate": 499.99997,
      "driftMin": 1.0,
      "driftMax": 4.0
    }
  },
  "source": {
    "package": "Cartoon FX 4 Remaster R 1.5.1.unitypackage",
    "files": [
      {
        "path": "Assets/JMO Assets/Cartoon FX Remaster/CFXR Prefabs/Nature/CFXR4 Snow Falling.prefab",
        "sha256": "db938faa4863cf632ada51fc0273c1fd65e79c70d41c0d43fd9bccfade95f720"
      },
      {
        "path": "Assets/JMO Assets/Cartoon FX Remaster/CFXR Assets/Graphics/cfxr proc glow soft p4 add.mat",
        "sha256": "cd34584b3f733452c961bd7c2b701779877a3c01da842228df7955a139754de3"
      },
      {
        "path": "Assets/JMO Assets/Cartoon FX Remaster/CFXR Assets/Shaders/CFXR_PASSES.cginc",
        "sha256": "61c5ae22cac7097053b397eea91ce5e34e1f4b99287bf8d8a93378d110ae8828"
      },
      {
        "path": "Assets/JMO Assets/Cartoon FX Remaster/CFXR Prefabs/Nature/Variants/CFXR4 Snow Falling (Light).prefab",
        "sha256": "6828d41d11121a4a2b8fa737b5e2f259ed742f415826a831020ff17a9a78bf7c"
      },
      {
        "path": "Assets/JMO Assets/Cartoon FX Remaster/CFXR Prefabs/Nature/Variants/CFXR4 Snow Falling (Dense).prefab",
        "sha256": "e3435855f892bd87064042c69a007a7fe107ad67d5a114b4c723bf675bdf4c9d"
      }
    ],
    "conversion": "Original P4 procedural glow; continuous 2D gravity particles with source lifetime, size, emission and drift envelope."
  }
};
