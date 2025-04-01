# DevLinker - MCP Host 插件

## 使用方法

1. 打开VS Code中的Copilot聊天窗口
2. 窗口输入栏中使用扩展聊天角色<code>@devlinker</code>
3. 通过下方中的/connectLocal或/connectRemote指令连接MCP服务
4. 连接成功后正常对话即可，模型建议GPT-4o，其它模型支持力度不一

## 常用聊天指令

- `/connectLocal` - 连接本地MCP服务进程
    <code>e.g. /connectLocal python D:/xxxx/xx.py</code>
    <code>e.g. /connectLocal node D:/xxxx/xx.js</code>
- `/connectRemote` - 连接远程MCP服务，注意：远程服务连接暂不稳定
- `/disconnect` - 断开某个MCP连接，后续接connectionID使用，连接成功后会返回id
    <code>e.g. /disconnect connectionID</code>
- `/disconnectAll` - 断开所有MCP连接
- `/refresh` - 刷新所有MCP服务连接
- `/load` - 将MCP服务配置文件拖拽至聊天窗口作为附件后，通过此指令进行加载并连接
- `/autoContext` - 由LLM选择引用哪些外部资源，但是要慎用，因为存在LLM使用旧数据的隐患，需要用户显式的说明重新拉取，才会获得最新数据

## 特性

1. 支持MCP Tools与Resources  
2. 支持管理多个MCP服务连接
3. 支持断开连接、重新连接MCP服务等功能  
4. 支持从本地json文件导入并连接MCP服务，须遵循如下格式：
<code>
    {
        "local": [
            "node D:/path/to/your/jsfile",
            "node D:/path/to/your/jsfile D:/path/to/target/folder",
            "python E:/path/to/your/pyfile"
        ],
        "remote": [
            "ws:/some/url"
        ]
    }
</code>