import { join } from "path";
import { statSync, readdirSync, unlinkSync } from "fs";
import * as shelljs from "shelljs";

export interface TextureGeneratorProps {
    PVRTexToolCLI: string;
    inputDir: string;
    quality: string;
    exportFormats: string[];
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
        quality = "high",
        exportFormats = ["PVRTC", "ETC1", "ETC2", "ASTC"],
    }: TextureGeneratorProps) {
    readdirSync(inputDir).filter((file: string) => statSync(join(inputDir, file)).isDirectory())
        .forEach((dir: string) => {
            const srcDir = join(inputDir, dir);
            const directoryFiles = readdirSync(srcDir);

            directoryFiles
                .filter((file: string) => {
                    const isDir = statSync(join(srcDir, file)).isDirectory();
                    return !isDir && file.indexOf(".ktx") === file.length - 4;
                })
                .forEach(file => {
                    unlinkSync(join(srcDir, file));
                });

            readImages({ PVRTexToolCLI, inputDir, quality, exportFormats });
        });
}

function readImages({ PVRTexToolCLI, inputDir, quality, exportFormats }: TextureGeneratorProps) {
    readdirSync(inputDir).filter((file: string) => statSync(join(inputDir, file)).isDirectory())
        .forEach((dir: string) => {
            const srcDir = join(inputDir, dir);
            const directoryFiles = readdirSync(srcDir);

            directoryFiles.forEach((file: string) => {
                const currentFile = join(srcDir, file);
                if (statSync(currentFile).isDirectory()) {
                    readImages({ PVRTexToolCLI, inputDir: currentFile, quality, exportFormats });
                } else {
                    const extension = file.substr(file.lastIndexOf(".") + 1).toLowerCase();
                    if (["jpg", "jpeg"].indexOf(extension) >= 0) {
                        convertImage({ PVRTexToolCLI, file: currentFile, quality, hasAlpha: false, exportFormats });
                    } else if ("png" === extension) {
                        convertImage({ PVRTexToolCLI, file: currentFile, quality, hasAlpha: true, exportFormats });
                    }
                }
            });
        });
}

function convertImage({ PVRTexToolCLI, file, quality, hasAlpha, exportFormats }: ImageConverterProps) {
    if (exportFormats.indexOf("PVRTC") >= 0) {
        convertToPVRTC({ PVRTexToolCLI, file, quality, hasAlpha });
    }
    if (exportFormats.indexOf("ETC1") >= 0) {
        convertToETC1({ PVRTexToolCLI, file, quality, hasAlpha });
    }
    if (exportFormats.indexOf("ETC2") >= 0) {
        convertToETC2({ PVRTexToolCLI, file, quality, hasAlpha });
    }
    if (exportFormats.indexOf("ASTC") >= 0) {
        convertToASTC({ PVRTexToolCLI, file, quality });
    }
}

function convertToPVRTC({ PVRTexToolCLI, file, quality, hasAlpha }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "PVRTC1_2" : "PVRTC1_2_RGB";
    const fileQuality = quality === "high" ? "pvrtcbest" : "pvrtcfastest";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(`${PVRTexToolCLI} -i "${file}" -flip y -pot + -square + -m -dither -f ${format},UBN,lRGB -q ${fileQuality} -o "${filename}-pvrtc.ktx"`);
}

function convertToETC1({ PVRTexToolCLI, file, quality, hasAlpha }: CliConverterProps) {
    if (hasAlpha) {
        return;
    }
    const filename = file.substr(0, file.lastIndexOf("."));
    const fileQuality = quality === "high" ? "etcslowperceptual" : "etcfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(`${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ETC1,UBN,lRGB -q ${fileQuality} -o "${filename}-etc1.ktx"`);
}

function convertToETC2({ PVRTexToolCLI, file, quality, hasAlpha }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "ETC2_RGBA" : "ETC2_RGB";
    const fileQuality = quality === "high" ? "etcslowperceptual" : "etcfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(`${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ${format},UBN,lRGB -q ${fileQuality} -o "${filename}-etc2.ktx"`);
}

function convertToASTC({ PVRTexToolCLI, file, quality }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const fileQuality = quality === "high" ? "astcexhaustive" : "astcveryfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(`${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ASTC_8x8,UBN,lRGB -q ${fileQuality} -o "${filename}-astc.ktx"`);
}

if (module && module.hasOwnProperty("exports")) {
    module.exports = generateTextures;
}
