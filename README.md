# Babylonjs texture generator

## About

This is a tool that generates PVRTC, ETC1, ETC2, ASTC, DXT textures from png and jpg files. It can run on node or as a gulp task.

It is meant to work with [Babylon.js](https://github.com/BabylonJS/Babylon.js). The tool is a port of two [.bat files](https://github.com/BabylonJS/Babylon.js/tree/master/Tools/CompressedTextured).

## Installation

In order to use the tool, you need to have installed:

* PVRTexToolCLI ([download](https://www.imgtec.com/developers/powervr-sdk-tools/installers/))
* ASTC Evaluation Codec ([download](https://github.com/ARM-software/astc-encoder/tree/master/Binary))
* Add *ASTC Evaluation Codec* to your path, a process which depends on your OS. ([documentation](http://cdn.imgtec.com/sdk-documentation/PVRTexTool.User+Manual.pdf) at page 5)
* Run `npm run build` in terminal

## Usage

Import/require the exposed function `generateTextures` to your script. It accepts one argument as an object with the following attributes:

* `PVRTexToolCLI` - *string*: The absolute path to the PVRTexToolCLI tool.
* `inputDir` - *string*: The directory where the image files are located. It will be read recursively and all the images will be used in order to generate the new textures.
* `quality` - *string (optional), (options "low"/"high", default: "high")*: The quality of the exported textures.
* `exportFormats` - *string[] (optional) (options "PVRTC"/"ETC1"/"ETC2"/"ASTC"/"DXT", default: ["PVRTC", "ETC1", "ETC2", "ASTC", "DXT"])*: The format of the exported textures.
* `async` - *boolean (optional, default: false)*: Whether the task should run asynchronously.

Example usage:
```javascript
import generateTextures from "babylonjs-texture-generator";
// Alternatively
// const generateTextures = require("babylonjs-texture-generator");

createGpuTexture({
    PVRTexToolCLI: "/Applications/Imagination/PowerVR_Graphics/PowerVR_Tools/PVRTexTool/CLI/OSX_x86/PVRTexToolCLI",
    inputDir: "/src",
    quality: "high",
    async: false,
    exportFormats: ["PVRTC", "ETC1", "ETC2", "ASTC", "DXT"]
});
```

### Limitations

Currently DXT files can not be exported on MacOS.
