const { SerialPort } = require('serialport');
const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
var max_pressure = 0;
app.use(express.static(__dirname + '/public'));

const port = new SerialPort({ path: 'COM7', baudRate: 2000000 });

let buffer = Buffer.alloc(0); // 缓存串口接收的所有数据

port.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    processBuffer();
});


function parsePressurePoint1(payload) {

    // 整数部分（3字节）
    const intPart =
        (payload[0] << 16) |
        (payload[1] << 8) |
        (payload[2]);

    // 小数部分（3字节） -> 放大 1000000 后的整数
    const floPart =
        (payload[3] << 16) |
        (payload[4] << 8) |
        (payload[5]);

    const value = intPart + floPart / 1_000_000;
    return value;
}

function processBuffer() {
    const HEADER = Buffer.from([0xFF, 0xFF, 0x06, 0x09]);
    const PACKET_SIZE = 1556; // 包头 + 数据段

    while (buffer.length >= PACKET_SIZE) {
        const headerIndex = buffer.indexOf(HEADER);

        if (headerIndex === -1) {
            // 没找到包头，丢弃旧数据
            buffer = Buffer.alloc(0);
            return;
        }

        if (buffer.length - headerIndex < PACKET_SIZE) {
            // 数据不够一包，等待更多数据
            break;
        }

        // 提取完整包
        const fullPacket = buffer.slice(headerIndex, headerIndex + PACKET_SIZE);
        const dataPayload = fullPacket.slice(20); // 跳过包头
        const dataArray = Array.from(dataPayload);

        const pressurePoint1 = parsePressurePoint1(dataPayload);

        if (pressurePoint1 > max_pressure) {
            max_pressure = pressurePoint1;
            // console.log('💡 还原压力点1浮点数值:', pressurePoint1);
            console.log('💡 Max is', max_pressure);

        }


        // // ✅ 封装成 JSON 并通过 WebSocket 推送
        // const payloadJson = JSON.stringify({ pressure_val: pressurePoint1 });
        // wss.clients.forEach(client => {
        //     if (client.readyState === WebSocket.OPEN) {
        //         client.send(payloadJson);
        //     }
        // });

        // 从缓存中移除处理过的数据
        buffer = buffer.slice(headerIndex + PACKET_SIZE);
    }
}