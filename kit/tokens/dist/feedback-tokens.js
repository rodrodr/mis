// GENERADO por build-tokens.mjs desde $extensions["es.maestro.feedback"]. No editar.
export default {
  "master": {
    "gain": 0.2,
    "gainMax": 0.25,
    "attackMs": 3,
    "detune": 0.03,
    "maxPerSecond": 8
  },
  "events": {
    "press": {
      "sound": null,
      "haptic": null
    },
    "select": {
      "sound": {
        "wave": "sine",
        "from": 880,
        "to": 660,
        "ms": 45
      },
      "haptic": "selection"
    },
    "success": {
      "sound": {
        "wave": "sine",
        "notes": [
          660,
          990
        ],
        "ms": 180
      },
      "haptic": "success"
    },
    "warning": {
      "sound": {
        "wave": "triangle",
        "from": 440,
        "to": 440,
        "ms": 160
      },
      "haptic": "warning"
    },
    "error": {
      "sound": {
        "wave": "triangle",
        "from": 220,
        "to": 160,
        "ms": 200
      },
      "haptic": "error"
    }
  }
};
