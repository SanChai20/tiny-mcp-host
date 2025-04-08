# DevLinker - MCP Host 插件

[![GitHub](https://img.shields.io/badge/GitHub-项目主页-blue?logo=github)](https://github.com/SanChai20/tiny-mcp-host)


## 使用方法

1. 打开VS Code中的Copilot聊天窗口
2. 使用扩展聊天角色<code>@devlinker</code>

    ```@devlinker```

3. 通过/connectLocal指令连接本地MCP服务进程，输入部分为执行命令及参数，如果文件路径中有空格，请使用双引号

    ```@devlinker /connectLocal node D://xxxx/xxx/xx.js```

    ```@devlinker /connectLocal python D://xxxx/xxx/xx.py```

    ```@devlinker /connectLocal python "D://xxxx/xx xx/xx.py"```

4. 或者通过/connectRemote指令连接远程SSE MCP服务

    ```@devlinker /connectRemote http://localhost:8000/sse```

5. 连接成功后会有Connection id返回，事后可以使用此id来断开连接
6. LLM模型建议GPT-4o，其它模型支持力度不一

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
            "http://xxx.xx.xx.x:8000/sse"
        ]
    }
```

## 常用聊天指令

- `/connectLocal` - 连接本地MCP服务进程

- `/connectRemote` - 连接SSE服务

- `/disconnect` - 断开某个MCP连接，后续接connectionID使用，连接成功后会返回id

    <code>@devlinker /disconnect connectionID</code>

- `/disconnectAll` - 断开所有MCP连接
- `/refresh` - 刷新所有MCP服务连接
- `/load` - 将MCP服务json配置文件拖拽至聊天窗口作为附件后，通过此指令进行全部加载并连接
- `/autoContext` - 由LLM选择引用哪些外部资源，但是要慎用，因为存在LLM使用旧数据的隐患，需要用户显式的说明重新拉取，才会获得最新数据


## 常见问题

- 在创建并连接本地MCP服务进程前建议先通过本地终端执行，排查问题

- 在显示已连接MCP服务为0时，窗口内依然存在断开连接等followups时不用在意，再次对话将会刷新

- 如果每次对话都返回同个错误，解决不了时尝试新建一个聊天


# DevLinker - MCP Host Plugin


## How to Use

1. Open the Copilot chat window in VS Code

2. Use the extension chat role <code>@devlinker</code>

    ```@devlinker```

3. Connect to MCP service by using /connectLocal command. If there are spaces in file paths, use double quotes

    ```@devlinker /connectLocal node D://xxxx/xxx/xx.js```

    ```@devlinker /connectLocal python D://xxxx/xxx/xx.py```

    ```@devlinker /connectLocal python "D://xxxx/xx xx/xx.py"```

4. Connect to MCP service by using /connectRemote command.

    ```@devlinker /connectRemote http://localhost:8000/sse```

5. After successful connection, a Connection id will be returned, which can be used later to disconnect

6. Recommended LLM model is GPT-4o, other models may have limited support

## Features

1. Supports MCP Tools and Resources (without using the /autoContext command, a popup will appear requiring users to select which Resources to reference)

2. Supports managing multiple MCP service connections

3. Supports actively disconnecting and reconnecting MCP services

4. Supports importing and connecting MCP services from local json files, which must follow this format:

```
    {
        "local": [
            "node D:/path/to/your/jsfile.js",
            "node D:/path/to/your/jsfile.js D:/path/to/target/folder",
            "python E:/path/to/your/pyfile.py"
        ],
        "remote": [
            "http://xxx.xx.xx.x:8000/sse"
        ]
    }
```

## Common Chat Commands

- /connectLocal - Connect to a local MCP service process

- /connectRemote - Connect to a remote SSE MCP service. Note: remote service connections are currently unstable

- /disconnect - Disconnect a specific MCP connection, use the connectionID that was returned after successful connection

    <code>@devlinker /disconnect connectionID</code>

- /disconnectAll - Disconnect all MCP connections

- /refresh - Refresh all MCP service connections

- /load - After dragging an MCP service configuration json file into the chat window as an attachment, use this command to load and connect to all services

- /autoContext - Let the LLM choose which external resources to reference. Use with caution as there is a risk of the LLM using outdated data. Users need to explicitly request refreshing data to get the latest information

## Common Issues

- Before creating and connecting to a local MCP service process, it is recommended to first execute it through your local terminal to troubleshoot any issues

- When the display shows 0 connected MCP services but disconnect and other followups still appear in the chat window, don't worry about it. The next conversation turn will refresh these options

- If every conversation returns the same error and you can't resolve it, try starting a new chat