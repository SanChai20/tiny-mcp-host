# DevLinker - MCP Host 插件

## 使用方法

1. 打开VS Code中的Copilot聊天窗口
2. 使用扩展聊天角色<code>@devlinker</code>

    ```@devlinker```

3. 通过/connectLocal或/connectRemote指令连接MCP服务，如果文件路径中有空格，请使用双引号

    ```@devlinker /connectLocal python D://xxxx/xxx/xx.py```

    ```@devlinker /connectLocal python "D://xxxx/xx xx/xx.py"```

4. 连接成功后会有Connection id返回，事后可以使用此id来断开连接
5. LLM模型建议GPT-4o，其它模型支持力度不一

## 特性

1. 支持MCP Tools与Resources（在不使用/autoContext指令的前提下将进行弹窗，需用户自己选择引用的Resources）  
2. 支持管理多个MCP服务连接
3. 支持主动断开连接、主动重新连接MCP服务等功能  
4. 支持从本地json文件导入并连接MCP服务，须遵循如下格式：

```
    {
        "local": [
            "node D:/path/to/your/jsfile.js",
            "node D:/path/to/your/jsfile.js D:/path/to/target/folder",
            "python E:/path/to/your/pyfile.py"
        ],
        "remote": [
            "ws:/some/url"
        ]
    }
```

## 常用聊天指令

- `/connectLocal` - 连接本地MCP服务进程
    
    <code>@devlinker /connectLocal python D:/xxxx/xx.py</code>

    <code>@devlinker /connectLocal node D:/xxxx/xx.js</code>

- `/connectRemote` - 连接远程MCP服务，注意：远程服务连接暂不稳定
- `/disconnect` - 断开某个MCP连接，后续接connectionID使用，连接成功后会返回id

    <code>@devlinker /disconnect connectionID</code>

- `/disconnectAll` - 断开所有MCP连接
- `/refresh` - 刷新所有MCP服务连接
- `/load` - 将MCP服务json配置文件拖拽至聊天窗口作为附件后，通过此指令进行全部加载并连接
- `/autoContext` - 由LLM选择引用哪些外部资源，但是要慎用，因为存在LLM使用旧数据的隐患，需要用户显式的说明重新拉取，才会获得最新数据