import { join } from "path";
import {
    stat, statSync, readdir, readdirSync, open, openSync, read, readSync, close, closeSync, Stats, existsSync,
} from "fs";
import * as shelljs from "shelljs";

export enum TextureType {
    PVRTC = "PVRTC",
    ETC1 = "ETC1",
    ETC2 = "ETC2",
    ASTC = "ASTC",
    DXT = "DXT",
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
    async: boolean;
}

interface CliConverterProps {
    PVRTexToolCLI: string;
    file: string;
    quality?: string;
    hasAlpha?: boolean;
    async: boolean;
    isCube: boolean;
}

type ImageConverterProps = CliConverterProps & { exportFormats: string[] };

// Cubeface file-name-suffixes in texture's face order.
const cubeFacesSuffixes = ["_px", "_nx", "_py", "_ny", "_pz", "_nz"];

/**
 * Generates gpu textures from png and jpg files
 */
export default function generateTextures(
    {
        PVRTexToolCLI,
        inputDir,
        quality = TextureQuality.HIGH,
        exportFormats = [TextureType.PVRTC, TextureType.ETC1, TextureType.ETC2, TextureType.ASTC, TextureType.DXT],
        async = false,
    }: TextureGeneratorProps) {
    // Mac does not support DXT format
    const indexOfDXT = exportFormats.indexOf(TextureType.DXT);
    if (process.platform === "darwin" && indexOfDXT >= 0) {
        console.warn("DXT format is not supported on MacOS");
        exportFormats.splice(indexOfDXT, 1);
    }
    readImages({ PVRTexToolCLI, inputDir, quality, exportFormats, async });
}

function readImages({ PVRTexToolCLI, inputDir, quality, exportFormats, async }: TextureGeneratorProps) {
    const openFileOrDir = (stats: Stats, filePath: string, fileName: string) => {
        if (stats.isDirectory()) {
            readImages({ PVRTexToolCLI, inputDir: filePath, quality, exportFormats, async });
        } else {
            const extension = fileName.substr(fileName.lastIndexOf(".") + 1).toLowerCase();

            const possibleCubeFaces = getCubeTextureFiles(filePath, fileName);
            let isCube = false;
            if (possibleCubeFaces.length > 0) {
                // But only convertImage on the first face
                const exp = new RegExp(cubeFacesSuffixes[0] + "." + extension + "$");
                if (!exp.test(fileName)) {
                    return;
                }
                isCube = true;
                filePath = possibleCubeFaces;
            }

            if (["jpg", "jpeg"].indexOf(extension) >= 0) {
                convertImage({ PVRTexToolCLI, file: filePath, quality, hasAlpha: false, exportFormats, async, isCube });
            } else if (extension === "png") {
                if (async) {
                    hasAlphaAsync(filePath, (hasAlpha: boolean) => {
                        convertImage({
                            PVRTexToolCLI,
                            file: filePath,
                            quality,
                            hasAlpha,
                            exportFormats,
                            async,
                            isCube,
                        });
                    });
                } else {
                    convertImage({
                        PVRTexToolCLI,
                        file: filePath,
                        quality,
                        hasAlpha: hasAlphaSync(filePath),
                        exportFormats,
                        async,
                        isCube,
                    });
                }
            }
        }
    };
    if (async) {
        readdir(inputDir, (err: NodeJS.ErrnoException, files: string[]) => {
            if (err) {
                throw err;
            }
            files.forEach((fileName: string) => {
                const filePath = join(inputDir, fileName);
                stat(filePath, (statErr: NodeJS.ErrnoException, stats: Stats) => {
                    if (statErr) {
                        throw statErr;
                    }
                    openFileOrDir(stats, filePath, fileName);
                });
            });
        });
    } else {
        readdirSync(inputDir).forEach((fileName: string) => {
            const filePath = join(inputDir, fileName);
            openFileOrDir(statSync(filePath), filePath, fileName);
        });
    }
}

function hasAlphaAsync(file: string, callback: (hasAlpha: boolean) => void) {
    const buffer = new Buffer(1);
    open(file, "r", (err: NodeJS.ErrnoException, fd: number) => {
        if (err) {
            throw err;
        }
        read(fd, buffer, 0, 1, 25, (readErr: NodeJS.ErrnoException, bytesRead: number, buf: Buffer) => {
            if (readErr) {
                throw readErr;
            }
            callback(6 === buf[0]);
            close(fd, () => { return; });
        });
    });
}

function hasAlphaSync(file: string): boolean {
    const buffer = new Buffer(1);
    const fd: number = openSync(file, "r");
    readSync(fd, buffer, 0, 1, 25);
    closeSync(fd);
    return 6 === buffer[0];
}

function getCubeTextureFiles(filePath: string, fileName: string): string {
    const extension = fileName.substr(fileName.lastIndexOf(".") + 1).toLowerCase();

    const exp = new RegExp("(" + cubeFacesSuffixes.join("|") + ")." + extension + "$");
    let paths = "";
    if (exp.test(fileName)) {
        // Check other faces exist
        const exp2 = new RegExp(fileName + "$");
        const prePath = filePath.replace(exp2, "");
        const preFileName = fileName.replace(exp, "");
        for (let i = 0; i < cubeFacesSuffixes.length; i++) {
            const fpath = prePath + preFileName + cubeFacesSuffixes[i] + "." + extension;
            if (existsSync(fpath)) {
                paths += fpath + (i === 5 ? "" : ",");
            } else {
                return "";
            }
        }
    }
    return paths;
}

function convertImage({ PVRTexToolCLI, file, quality, hasAlpha, exportFormats, async, isCube }: ImageConverterProps) {
    if (exportFormats.indexOf(TextureType.PVRTC) >= 0) {
        convertToPVRTC({ PVRTexToolCLI, file, quality, hasAlpha, async, isCube });
    }
    if (exportFormats.indexOf(TextureType.ETC1) >= 0) {
        convertToETC1({ PVRTexToolCLI, file, quality, hasAlpha, async, isCube });
    }
    if (exportFormats.indexOf(TextureType.ETC2) >= 0) {
        convertToETC2({ PVRTexToolCLI, file, quality, hasAlpha, async, isCube });
    }
    if (exportFormats.indexOf(TextureType.ASTC) >= 0) {
        convertToASTC({ PVRTexToolCLI, file, quality, async, isCube });
    }
    if (exportFormats.indexOf(TextureType.DXT) >= 0) {
        convertToDXT({ PVRTexToolCLI, file, hasAlpha, async, isCube });
    }
}

function convertToPVRTC({ PVRTexToolCLI, file, quality, hasAlpha, async, isCube }: CliConverterProps) {
    const filename = isCube
        ? file.substr(0, file.split(",")[0].lastIndexOf(cubeFacesSuffixes[0] + "."))
        : file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "PVRTC1_2" : "PVRTC1_2_RGB";
    const fileQuality = quality === TextureQuality.HIGH ? "pvrtcbest" : "pvrtcfastest";
    // tslint:disable:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" ${isCube ? "-cube" : "-flip y"} -pot + -square + -m -dither -f ${format},UBN,lRGB -q ${fileQuality} -o "${filename}-pvrtc.ktx"`,
        { async },
    );
    // tslint:enable:max-line-length
}

function convertToETC1({ PVRTexToolCLI, file, quality, hasAlpha, async, isCube }: CliConverterProps) {
    if (hasAlpha) {
        return;
    }
    const filename = isCube
        ? file.substr(0, file.split(",")[0].lastIndexOf(cubeFacesSuffixes[0] + "."))
        : file.substr(0, file.lastIndexOf("."));
    const fileQuality = quality === TextureQuality.HIGH ? "etcslowperceptual" : "etcfast";
    // tslint:disable:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" ${isCube ? "-cube" : "-flip y"} -pot + -m -f ETC1,UBN,lRGB -q ${fileQuality} -o "${filename}-etc1.ktx"`,
        { async },
    );
    // tslint:enable:max-line-length
}

function convertToETC2({ PVRTexToolCLI, file, quality, hasAlpha, async, isCube }: CliConverterProps) {
    const filename = isCube
        ? file.substr(0, file.split(",")[0].lastIndexOf(cubeFacesSuffixes[0] + "."))
        : file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "ETC2_RGBA" : "ETC2_RGB";
    const fileQuality = quality === TextureQuality.HIGH ? "etcslowperceptual" : "etcfast";
    // tslint:disable:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" ${isCube ? "-cube" : "-flip y"} -pot + -m -f ${format},UBN,lRGB -q ${fileQuality} -o "${filename}-etc2.ktx"`,
        { async },
    );
    // tslint:enable:max-line-length
}

function convertToASTC({ PVRTexToolCLI, file, quality, async, isCube }: CliConverterProps) {
    const filename = isCube
        ? file.substr(0, file.split(",")[0].lastIndexOf(cubeFacesSuffixes[0] + "."))
        : file.substr(0, file.lastIndexOf("."));
    const fileQuality = quality === TextureQuality.HIGH ? "astcexhaustive" : "astcveryfast";
    // tslint:disable:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" ${isCube ? "-cube" : "-flip y"} -pot + -m -f ASTC_8x8,UBN,lRGB -q ${fileQuality} -o "${filename}-astc.ktx"`,
        { async },
    );
    // tslint:enable:max-line-length
}

function convertToDXT({ PVRTexToolCLI, file, hasAlpha, async, isCube }: CliConverterProps) {
    const filename = isCube
        ? file.substr(0, file.split(",")[0].lastIndexOf(cubeFacesSuffixes[0] + "."))
        : file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "BC2" : "BC1";
    // tslint:disable:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" ${isCube ? "-cube" : "-flip y"} -pot + -m -f ${format},UBN,lRGB -o "${filename}-dxt.ktx"`,
        { async },
    );
    // tslint:enable:max-line-length
}

if (module && module.hasOwnProperty("exports")) {
    module.exports = generateTextures;
}
