import { join } from "path";
import { stat, statSync, readdir, readdirSync, open, openSync, read, readSync, close, closeSync, Stats } from "fs";
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
            if (["jpg", "jpeg"].indexOf(extension) >= 0) {
                convertImage({ PVRTexToolCLI, file: filePath, quality, hasAlpha: false, exportFormats, async });
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
            close(fd);
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

function convertImage({ PVRTexToolCLI, file, quality, hasAlpha, exportFormats, async }: ImageConverterProps) {
    if (exportFormats.indexOf(TextureType.PVRTC) >= 0) {
        convertToPVRTC({ PVRTexToolCLI, file, quality, hasAlpha, async });
    }
    if (exportFormats.indexOf(TextureType.ETC1) >= 0) {
        convertToETC1({ PVRTexToolCLI, file, quality, hasAlpha, async });
    }
    if (exportFormats.indexOf(TextureType.ETC2) >= 0) {
        convertToETC2({ PVRTexToolCLI, file, quality, hasAlpha, async });
    }
    if (exportFormats.indexOf(TextureType.ASTC) >= 0) {
        convertToASTC({ PVRTexToolCLI, file, quality, async });
    }
    if (exportFormats.indexOf(TextureType.DXT) >= 0) {
        convertToDXT({ PVRTexToolCLI, file, hasAlpha, async });
    }
}

function convertToPVRTC({ PVRTexToolCLI, file, quality, hasAlpha, async }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "PVRTC1_2" : "PVRTC1_2_RGB";
    const fileQuality = quality === TextureQuality.HIGH ? "pvrtcbest" : "pvrtcfastest";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" -flip y -pot + -square + -m -dither -f ${format},UBN,lRGB -q ${fileQuality} -o "${filename}-pvrtc.ktx"`,
        { async },
    );
}

function convertToETC1({ PVRTexToolCLI, file, quality, hasAlpha, async }: CliConverterProps) {
    if (hasAlpha) {
        return;
    }
    const filename = file.substr(0, file.lastIndexOf("."));
    const fileQuality = quality === TextureQuality.HIGH ? "etcslowperceptual" : "etcfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ETC1,UBN,lRGB -q ${fileQuality} -o "${filename}-etc1.ktx"`,
        { async },
    );
}

function convertToETC2({ PVRTexToolCLI, file, quality, hasAlpha, async }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "ETC2_RGBA" : "ETC2_RGB";
    const fileQuality = quality === TextureQuality.HIGH ? "etcslowperceptual" : "etcfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ${format},UBN,lRGB -q ${fileQuality} -o "${filename}-etc2.ktx"`,
        { async },
    );
}

function convertToASTC({ PVRTexToolCLI, file, quality, async }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const fileQuality = quality === TextureQuality.HIGH ? "astcexhaustive" : "astcveryfast";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ASTC_8x8,UBN,lRGB -q ${fileQuality} -o "${filename}-astc.ktx"`,
        { async },
    );
}

function convertToDXT({ PVRTexToolCLI, file, hasAlpha, async }: CliConverterProps) {
    const filename = file.substr(0, file.lastIndexOf("."));
    const format = hasAlpha ? "BC2" : "BC1";
    // tslint:disable-next-line:max-line-length
    shelljs.exec(
        `${PVRTexToolCLI} -i "${file}" -flip y -pot + -m -f ${format},UBN,lRGB -o "${filename}-dxt.ktx"`,
        { async },
    );
}

if (module && module.hasOwnProperty("exports")) {
    module.exports = generateTextures;
}
