<template>
  <div class="container">
    <el-card class="file-transfer">
      <template v-slot:header>
        <div class="card-header">
          <div class="user-info">
            <h2>局域网文件传输</h2>
            <span v-if="userId">当前用户ID: {{ userId }}</span>
          </div>
        </div>
      </template>
      
      <div class="main-content">
        <div class="user-list">
          <h3>在线用户</h3>
          <el-radio-group v-model="selectedUserId">
            <el-radio 
              v-for="user in otherUsers" 
              :key="user.id" 
              :label="user.id"
            >
              {{ user.name }}
            </el-radio>
          </el-radio-group>
        </div>

        <div class="file-list">
          <!-- 发送区域 -->
          <div class="send-area">
            <div 
              class="upload-area"
              :class="{ 'is-dragover': isDragover, 'no-user': !selectedUser }"
              @drop.prevent="handleDrop"
              @dragover.prevent="isDragover = true"
              @dragleave.prevent="isDragover = false"
            >
              <el-upload
                class="upload-demo"
                action="#"
                :auto-upload="false"
                :show-file-list="false"
                :on-change="handleFileChange"
                :multiple="true"
                drag
              >
                <i class="el-icon-upload"></i>
                <div class="el-upload__text">
                  将文件拖到此处，或点击添加文件
                </div>
              </el-upload>
            </div>

            <!-- 待发送文件列表 -->
            <div class="pending-files" v-if="pendingFiles.length > 0">
              <h4>待发送文件</h4>
              <el-table :data="pendingFiles" size="small">
                <el-table-column prop="name" label="文件名" />
                <el-table-column label="大小" width="120">
                  <template v-slot="{ row }">
                    {{ formatFileSize(row.size) }}
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="120">
                  <template v-slot="{ $index }">
                    <el-button 
                      type="danger"
                      size="mini"
                      @click="removePendingFile($index)"
                    >
                      移除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
              
              <div class="send-actions">
                <el-button 
                  type="primary" 
                  :disabled="!selectedUser || pendingFiles.length === 0"
                  @click="sendFiles"
                >
                  {{ selectedUser 
                    ? `发送给 ${selectedUser.name} (${pendingFiles.length}个文件)` 
                    : '请先选择接收用户'
                  }}
                </el-button>
                <el-button @click="clearPendingFiles">清空列表</el-button>
              </div>
            </div>
          </div>

          <h3>收到的文件</h3>
          <el-table :data="files" style="width: 100%">
            <el-table-column prop="filename" label="文件名" />
            <el-table-column prop="size" label="大小">
              <template v-slot="{ row }">
                {{ formatFileSize(row.size) }}
              </template>
            </el-table-column>
            <el-table-column prop="from" label="发送者" />
            <el-table-column label="操作">
              <template v-slot="{ row }">
                <el-button 
                  type="primary"
                  @click="downloadFile(row)"
                >
                  下载
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  name: 'App',
  data() {
    return {
      API_BASE: 'http://192.168.0.5:3000',
      files: [],
      ws: null,
      userId: null,
      users: [],
      selectedUserId: null,
      uploadFileList: [],
      isDragover: false,
      pendingFiles: [], // 待发送的文件列表
      sending: false // 是否正在发送文件
    }
  },
  computed: {
    uploadUrl() {
      return `${this.API_BASE}/upload`
    },
    uploadData() {
      return {
        targetUserId: this.selectedUserId,
        fromUserId: this.userId
      }
    },
    otherUsers() {
      return this.users.filter(user => user.id !== this.userId)
    },
    selectedUser() {
      return this.users.find(user => user.id === this.selectedUserId)
    }
  },
  methods: {
    async connectWebSocket() {
      const wsUrl = this.API_BASE.replace('http://', 'ws://')
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        switch (message.type) {
          case 'userId':
            this.userId = message.data
            break
          case 'userList':
            this.users = message.data
            break
          case 'newFile':
            this.files.push({
              ...message.data,
              from: message.from
            })
            this.$message.success('收到新文件')
            break
        }
      }
      
      this.ws.onclose = () => {
        setTimeout(this.connectWebSocket, 1000)
      }
    },
    
    formatFileSize(bytes) {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    },
    
    handleUploadSuccess(response, file, fileList) {
      if (fileList) {
        this.$message.success(`文件 ${file.name} 发送成功`);
        if (fileList.every(f => f.status === 'success')) {
          this.$message.success('所有文件发送完成');
          this.uploadFileList = [];
        }
      } 
      else {
        this.$message.success(`文件 ${file.name} 发送成功`);
      }
    },
    
    handleUploadError(err, file) {
      this.$message.error(`文件 ${file.name} 发送失败: ${err.message || '未知错误'}`);
    },
    
    beforeUpload(file) {
      if (!this.selectedUserId) {
        this.$message.error('请先选择接收用户');
        return false;
      }
      
      const isLt2G = file.size / 1024 / 1024 / 1024 < 2;
      if (!isLt2G) {
        this.$message.error('文件大小不能超过2GB');
        return false;
      }

      this.$message({
        message: `准备发送文件: ${file.name}`,
        type: 'info'
      });
      
      return true;
    },
    
    async downloadFile(file) {
      try {
        this.$message.info('开始下载文件...');
        const response = await axios({
          url: `${this.API_BASE}${file.path}`,
          method: 'GET',
          responseType: 'blob',
          headers: {
            'Accept': '*/*'  // 接受任何类型的响应
          }
        });

        // 获取文件扩展名
        const ext = file.filename.toLowerCase().substring(file.filename.lastIndexOf('.'));
        
        // 根据文件类型设置正确的 MIME 类型
        let mimeType = 'application/octet-stream';  // 默认二进制流
        if (ext === '.csv') {
          mimeType = 'text/csv';
        }

        // 创建正���的 Blob 对象
        const blob = new Blob([response.data], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        
        // 创建下载链接
        const link = document.createElement('a');
        link.href = url;
        link.download = file.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // 触发下载
        link.click();
        
        // 清理
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);
        
        this.$message.success('文件下载完成');
      } catch (error) {
        console.error('下载失败:', error);
        this.$message.error('文件下载失败');
      }
    },
    
    handleExceed(files, fileList) {
      this.$message.warning(`最多只能选择 10 个文件，本次选择了 ${files.length} 个文件，共选择了 ${files.length + fileList.length} 个文件`);
    },
    
    handleRemove(file) {
      const index = this.uploadFileList.indexOf(file);
      if (index !== -1) {
        this.uploadFileList.splice(index, 1);
      }
    },
    
    handleDrop(e) {
      this.isDragover = false;
      const files = Array.from(e.dataTransfer.files);
      
      // 检查文件数量限制
      if (files.length + this.pendingFiles.length > 10) {
        this.$message.warning('文件列表最多只能包含10个文件');
        return;
      }
      
      // 处理每个文件
      files.forEach(file => {
        // 使用 handleFileChange 来处理文件
        this.handleFileChange({ raw: file });
      });
    },

    handleFileChange(file) {
      // 检查文件大小 (2GB = 2 * 1024 * 1024 * 1024 bytes)
      const maxSize = 2 * 1024 * 1024 * 1024;  // 2GB in bytes
      if (file.raw.size > maxSize) {
        this.$message.error('文件大小不能超过2GB');
        return;
      }

      // 检查是否已经在列表中
      if (this.pendingFiles.some(f => f.name === file.raw.name && f.size === file.raw.size)) {
        this.$message.warning('该文件已在列表中');
        return;
      }

      // 检查文件数量限制
      if (this.pendingFiles.length >= 10) {
        this.$message.warning('最多只能添加10个文件');
        return;
      }

      this.pendingFiles.push(file.raw);
    },

    removePendingFile(index) {
      this.pendingFiles.splice(index, 1);
    },

    clearPendingFiles() {
      this.pendingFiles = [];
    },

    async sendFiles() {
      if (this.sending) return;
      if (!this.selectedUser) {
        this.$message.error('请先选择接收用户');
        return;
      }

      this.sending = true;
      const totalFiles = this.pendingFiles.length;
      let successCount = 0;
      
      // 创建一个消息实例来显示进度
      const loadingMessage = this.$message({
        message: `正在发送文件... (0/${totalFiles})`,
        duration: 0,  // 消息不会自动关闭
        type: 'info'
      });

      try {
        for (const file of this.pendingFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('targetUserId', this.selectedUserId);
          formData.append('fromUserId', this.userId);

          try {
            await axios.post(this.uploadUrl, formData);
            successCount++;
            // 更新进度消息
            loadingMessage.message = `正在发送文件... (${successCount}/${totalFiles})`;
          } catch (error) {
            console.error(`文件 ${file.name} 发送失败:`, error);
          }
        }

        // 关闭进度消息
        loadingMessage.close();

        // 显示最终结果
        if (successCount === totalFiles) {
          this.$message.success(`全部 ${totalFiles} 个文件发送完成`);
          this.clearPendingFiles();
        } else {
          this.$message.warning(`发送完成，${successCount}/${totalFiles} 个文件发送成功`);
        }
      } catch (error) {
        loadingMessage.close();
        this.$message.error('发送过程中出现错误');
      } finally {
        this.sending = false;
      }
    }
  },
  mounted() {
    this.connectWebSocket()
  }
}
</script>

<style>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.file-transfer {
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.main-content {
  margin-top: 20px;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
}

.user-list {
  padding: 20px;
  border-right: 1px solid #eee;
}

.user-list .el-radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.file-list {
  flex: 1;
}

h2, h3 {
  margin: 0 0 20px 0;
}

.el-upload__tip {
  margin-top: 10px;
  color: #666;
}

.upload-demo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.el-upload-list {
  width: 100%;
  margin-top: 10px;
}

.upload-area {
  padding: 10px;
  border: 2px dashed #dcdfe6;
  border-radius: 6px;
  margin-bottom: 20px;
  transition: all 0.3s;
}

.upload-area.is-dragover {
  background-color: #f5f7fa;
  border-color: #409eff;
}

.upload-area.no-user {
  background-color: #fef0f0;
  border-color: #f56c6c;
}

.upload-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.el-upload-dragger {
  width: 100%;
  height: 120px !important;  /* 减小高度 */
}

.el-upload__text {
  margin: 10px 0;
  font-size: 14px;
  color: #606266;
}

.el-upload__tip {
  margin-top: 10px;
  color: #909399;
}

.el-icon-upload {
  font-size: 48px;
  color: #c0c4cc;
  margin-bottom: 10px;
}

.pending-files {
  margin-top: 20px;
}

.pending-files h4 {
  margin: 0 0 10px 0;
}

.send-actions {
  margin-top: 15px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
