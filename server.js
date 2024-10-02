const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = 8083;

app.use(cors());

// const server = app.listen(PORT, () => {
//     console.log(`Server is running on http://localhost:${PORT}`);
// });

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

// WebSocket 서버 설정
const wss = new WebSocket.Server({ server });

let rooms = {};  // 방 ID를 저장하는 객체

// 방 생성 API
app.post('/create-room', (req, res) => {
    const roomId = uuidv4();  // 고유한 방 ID 생성
    rooms[roomId] = { clients: [], createdAt: Date.now() };  // 방 생성 시 클라이언트 리스트도 함께 저장
    const roomUrl = `http://localhost:5173/room/${roomId}`;
    res.json({ roomUrl });
});

// 방 유효성 검사 API
app.get('/check-room/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    if (rooms[roomId]) {
        res.json({ valid: true });
    } else {
        res.json({ valid: false });
    }
});

// WebSocket 연결 및 방 관리
wss.on('connection', (ws) => {
    let currentRoomId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'join-room') {
            currentRoomId = data.roomId;

            // 방이 존재하지 않으면 방을 생성하지 않음 (API를 통해서만 방 생성 가능)
            if (rooms[currentRoomId]) {
                // 방에 새로운 클라이언트 추가
                rooms[currentRoomId].clients.push(ws);
                console.log(`Client joined room: ${currentRoomId}`);
            } else {
                console.log(`Invalid room ID: ${currentRoomId}`);
                ws.close();  // 유효하지 않은 방일 경우 연결을 끊음
            }
        } else {
            // 방의 다른 사용자에게 메시지 전달
            if (currentRoomId && rooms[currentRoomId]) {
                rooms[currentRoomId].clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        }
    });

    ws.on('close', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            // 사용자가 방을 나가면 클라이언트 리스트에서 제거
            rooms[currentRoomId].clients = rooms[currentRoomId].clients.filter(client => client !== ws);

            // 다른 사용자에게 알림 메시지 브로드캐스트
            rooms[currentRoomId].clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'user-left',
                        message: '상대방이 나갔습니다.',
                    }));
                }
            });
            // 방에 더 이상 클라이언트가 없으면 방 삭제
            if (rooms[currentRoomId].clients.length === 0) {
                delete rooms[currentRoomId];
                console.log(`Room ${currentRoomId} has been deleted because it's empty.`);
            }
        }
    });
});
