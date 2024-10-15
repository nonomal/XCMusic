import axios from 'axios';
const fs = require('fs');
const path = require('path');
const os = require('os');
const tmpDir = os.tmpdir();
// const ffmpeg = window.api.ffmpeg;
const NodeID3 = require('node-id3');
import indexDB from '@/utils/indexDB';

export class Download {
    /**
     * 下载歌曲文件并保存到本地
     * @returns 下载的文件路径
     */
    static async song(songUrl: string, track: { name: string; ar: Array<object>; al: { name: string; picUrl: string; }; }, downloadDir: string): Promise<string> {
        if (!fs.existsSync(downloadDir)) {
            // throw new Error('Invalid download directory');
        }
        const name = sanitizeFileName(track.name);
        const artist = track.ar.map((ar: any) => ar.name).join('; ');
        const album = track.al.name;
        const coverUrl = track.al.picUrl;

        // 从 URL 中提取文件格式
        const fileExtension = path.extname(songUrl).slice(1);  // 获取后缀并去掉前面的"."

        if (!['mp3', 'flac'].includes(fileExtension)) {
            throw new Error(`Unsupported file format: ${fileExtension}`);
        }

        // 创建一个临时文件路径
        let tempFilePath = path.join(downloadDir, `${name}-temp.${fileExtension}`);
        let outputFilePath = path.join(downloadDir, `${name}.${fileExtension}`);

        // 下载歌曲文件
        const writer = fs.createWriteStream(tempFilePath);
        const response = await axios({
            url: songUrl,
            method: 'GET',
            responseType: 'stream',
            family: 4, // 使用 IPv4
            timeout: 30000 // 设置超时时间为30秒
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                fs.renameSync(tempFilePath, outputFilePath);
                // 如果文件是 mp3 或 flac，嵌入歌曲元数据
                if (fileExtension === 'mp3' || fileExtension === 'flac') {
                    let coverBuffer = null;
                    if (coverUrl) {
                        const coverResponse = await axios({
                            method: 'get',
                            url: coverUrl,
                            responseType: 'arraybuffer',
                            family: 4, // 使用 IPv4
                            timeout: 10000 // 设置超时时间为10秒
                        })
                        coverBuffer = Buffer.from(coverResponse.data);
                    }

                    const tags = {
                        title: name,
                        artist: artist,
                        album: album,
                        APIC: {
                            mime: 'image/jpeg',  // MIME 类型可以是 'image/jpeg' 或 'image/png'
                            type: 3,             // 3 代表封面图像
                            description: 'Cover',
                            imageBuffer: coverBuffer
                        }  // APIC 用于封面图片
                    };

                    NodeID3.write(tags, outputFilePath);
                }

                resolve(outputFilePath);
            });
            writer.on('error', reject);
        });
    }

    /**
     * 在indexDB中保存已下载的歌曲信息
     * 
     * 
     */
    static async #saveSongInfo(track: any, filePath: string) {
        const db = new indexDB('ncm', 'downloaded_songs');
        await db.openDatabase();
        await db.storePlaylist([{
            id: track.id,
            name: track.name,
            artist: track.ar.map((ar: any) => ar.name).join('; '),
            album: track.al.name,
            filePath: filePath,
        }]);
    }

    /**
     * 获取已下载的歌曲信息
     * 
     */
    // async getDownloadedSongs() {
    //     const db = new indexDB('ncm', 'downloaded_songs');
    //     await db.openDatabase();
    //     return await db.getDownloadedSongs();
    // }
}

/**
 * 对文件名进行合法化处理，替换掉 Windows 不允许的字符
 * @param fileName 原始文件名
 * @returns 合法的文件名
 */
function sanitizeFileName(fileName: string): string {
    // 替换掉 Windows 系统不允许的字符，如 \ / : * ? " < > |
    return fileName.replace(/[\\/:*?"<>|]/g, '-');
}