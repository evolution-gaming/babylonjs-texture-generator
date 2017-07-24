import { join } from "path";
import { statSync, readdirSync } from "fs";
import * as shelljs from "shelljs";
import * as fs from "fs";

export enum TextureType {
    PVRTC = "PVRTC",
    ETC1 = "ETC1",
    ETC2 = "ETC2",
    ASTC = "ASTC",
}

export enum TextureQuality {
    HIGH = "high",
    LOW = "low",
}

export interface TextureGeneratorProps {
    PVRTexToolCLI: string;
    inputDir: string;
    quality: TextureQuality;
    exportFormats: TextureType[];
}

interface CliConverterProps {
    PVRTexToolCLI: string;
    file: string;
    quality: string;
    hasAlpha?: boolean;
}

type ImageConverterProps = CliConverterProps & { exportFormats: string[] };

/**
 * Generates gpu textures from png and jpg files
 */
export default function generateTextures(
    {
        PVRTexToolCLI,
        inputDir,
        quality = TextureQuality.HIGH,
        exportFormats = [TextureType.PVRTC, TextureType.ETC1, TextureType.ETC2, TextureType.ASTC],
    }: TextureGeneratorProps) {
    readImages({ PVRTexToolCLI, inputDir, quality, exportFormats });
}

function readImages({ PVRTexToolCLI, inputDir, quality, exportFormats }: TextureGeneratorProps) {
    readdirSync(inputDir).forEach((file: string) => {
        const filePath = join(inputDir, file);
        if (statSync(filePath).isDirectory()) {
            readImages({ PVRTexToolCLI, inputDir: filePath, quality, exportFormats });
        } else {
            const extension = file.substr(file.lastIndexOf(".") + 1).toLowerCase();
            if (["jpg", "jpeg"].indexOf(extension) >= 0) {
                convertImage({ PVRTexToolCLI, file: filePath, quality, hasAlpha: false, exportFormats });
            } else if ("png" === extension) {
                hasAlpha(filePath, function(err, _hasAlpha){
                    if (err) throw err;
                    convertImage({ PVRTexToolCLI, file: filePath, quality, hasAlpha: _hasAlpha, exportFormats });
                });
            }
        }
    });
}

function convertImage({ PVRTexToolCLI, file, quality, hasAlpha, exportFormats }: ImageConverterProps) {
    if (exportFormats.indexOf(TextureType.PVRTC) >= 0) {
        convertToPVRTC({ PVRTexToolCLI, file, quality, hasAlpha });
    }
    if (exportFormats.indexOf(TextureType.ETC1) >= 0) {
        convertToETC1({ PVRTexToolCLI, file, quality, hasAlpha });
    }
    if (exportFormats.indexOf(TextureType.ETC2) >= 0) {
        convertToETC2({ PVRTexToolCLI, file, quality, hasAlpha });
    }
    if (exportFormats.indexOf(TextureType.ASTC) >= 0) {
        convertToASTC({ PVRTexToolCLI, file, quality });
    }
}

function convertToPVRTC({ PVRTexToolCLI, file, quality, hasAlpha }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "PVRTC1_2" : "PVRTC1_2_RGB";
    const fileQuality = quality === TextureQuality.HIGH ? "pvrtcbest" : "pvrtcfastest";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(`${PVRTexToolCLI} -i "${file}" -flip y -pot + -square + -m -dither -f ${format},UBN,lRGB -q ${fileQuality} -o "${filename}-pvrtc.ktx"`);
}

function convertToETC1({ PVRTexToolCLI, file, quality, hasAlpha }: CliConverterProps) {
    if (hasAlpha) {
        return;
    }
    const filename = file.substr(0, file.lastIndexOf("."));
    const fileQuality = quality === TextureQuality.HIGH ? "etcslowperceptual" : "etcfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(`${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ETC1,UBN,lRGB -q ${fileQuality} -o "${filename}-etc1.ktx"`);
}

function convertToETC2({ PVRTexToolCLI, file, quality, hasAlpha }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "ETC2_RGBA" : "ETC2_RGB";
    const fileQuality = quality === TextureQuality.HIGH ? "etcslowperceptual" : "etcfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(`${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ${format},UBN,lRGB -q ${fileQuality} -o "${filename}-etc2.ktx"`);
}

function convertToASTC({ PVRTexToolCLI, file, quality }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const fileQuality = quality === TextureQuality.HIGH ? "astcexhaustive" : "astcveryfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(`${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ASTC_8x8,UBN,lRGB -q ${fileQuality} -o "${filename}-astc.ktx"`);
}

function hasAlpha(png, fn) {
    if ('string' == typeof png) return fromFile(png, fn);
    return 6 == png[25];
}

function fromFile(file, fn) {
    var buf = new Buffer(1);
    fs.open(file, 'r', function(err, fd){
        if (err) return fn(err);
        fs.read(fd, buf, 0, 1, 25, function(err, read, buf){
            if (err) return fn(err);
            fs.close(fd, function(err){
                fn(err, 6 == buf[0]);
            });
        });
    });
}

if (module && module.hasOwnProperty("exports")) {
    module.exports = generateTextures;
}

