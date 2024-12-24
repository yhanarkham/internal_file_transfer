const express = require('express');
const multer = require('multer');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();

// 在文件顶部添加 MIME 类型映射
const mimeTypes = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
};

// 配置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    // 解码文件名
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    // 使用时间戳和原始文件名
    const fileName = Date.now() + '-' + originalName;
    cb(null, fileName);
  }
});

const upload = multer({ storage: storage });

// 存储在线用户
const onlineUsers = new Map(); // userId -> websocket

// 启用CORS
app.use(cors());
app.use('/uploads', express.static('uploads', {
  setHeaders: (res, path) => {
    const ext = path.toLowerCase().substring(path.lastIndexOf('.'));
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment');
  }
}));

// 生成唯一用户ID
function generateUserId() {
  return 'user_' + Math.random().toString(36).substr(2, 9);
}

// 处理文件上传
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  
  // 解码文件名
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  
  const fileInfo = {
    originalName: originalName,
    filename: req.file.filename,
    size: req.file.size,
    path: `/uploads/${req.file.filename}`
  };

  // 获取目���用户ID
  const targetUserId = req.body.targetUserId;
  
  if (targetUserId && onlineUsers.has(targetUserId)) {
    // 发送文件通知给指定用户
    const targetWs = onlineUsers.get(targetUserId);
    targetWs.send(JSON.stringify({
      type: 'newFile',
      data: fileInfo,
      from: req.body.fromUserId
    }));
  }
  
  res.json(fileInfo);
});

// 获取文件列表
app.get('/files', (req, res) => {
  if (!fs.existsSync('uploads')) {
    return res.json([]);
  }
  
  fs.readdir('uploads', (err, files) => {
    if (err) {
      return res.status(500).send('Error reading files');
    }
    
    const fileList = files.map(filename => {
      const stats = fs.statSync(path.join('uploads', filename));
      // 从文件名中提取原始文件名（去掉时间戳前缀）
      const originalName = filename.substring(filename.indexOf('-') + 1);
      return {
        filename: originalName, // 使用原始文件名
        size: stats.size,
        path: `/uploads/${filename}`
      };
    });
    
    res.json(fileList);
  });
});

// 监听所有网卡，这样局域网内的其他设备也能访问
const server = app.listen(3000, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:3000');
  console.log('Local network access:');
  const networkInterfaces = require('os').networkInterfaces();
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((interface) => {
      if (interface.family === 'IPv4' && !interface.internal) {
        console.log(`http://${interface.address}:3000`);
      }
    });
  });
});

// 设置WebSocket服务器
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const userId = generateUserId();
  onlineUsers.set(userId, ws);
  
  // 发送用户ID给新连接的客户端
  ws.send(JSON.stringify({
    type: 'userId',
    data: userId
  }));
  
  // 广播用户列表更新
  broadcastUserList();
  
  console.log(`User ${userId} connected`);
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });
  
  ws.on('close', () => {
    onlineUsers.delete(userId);
    broadcastUserList();
    console.log(`User ${userId} disconnected`);
  });
});

// 广播用户列表
function broadcastUserList() {
  const userList = Array.from(onlineUsers.keys()).map(userId => ({
    id: userId,
    name: `用户 ${userId.split('_')[1]}`
  }));
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'userList',
        data: userList
      }));
    }
  });
} 