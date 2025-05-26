# Prompt templating

## Selection
By default, the selected text will be added to the end of the prompt.  
Let's say we have selected text `Some example text.` and prompt `You are an assistant helping a user write more content in a document based on a prompt.`

The final prompt will be:
```
You are an assistant helping a user write more content in a document based on a prompt.

Some example text.
```
### Custom place for selection
Use keyword `{{=SELECTION=}}` to insert selected text in different place:
```
{{=SELECTION=}}
You are an assistant helping a user write more content in a document based on a prompt.
```
Translates to:
```
Some example text.
You are an assistant helping a user write more content in a document based on a prompt.
```


## Enhanced Actions (Context, RAG)
By default, the context will be added to the end of the prompt after the default selection position:
```
Selected text with [[Some meaningful document]].

Context:
Some example context about the selected text from some meaningful document.
```

### Custom place for context
The keyword `{{=CONTEXT=}}` will be replaced with multiline string of context.
```
# Relevant context
{{=CONTEXT=}}

# Selected text
{{=SELECTION=}}
```

Translates to:
```
# Relevant context
Some example context about the selected text from some meaningful document.

# Selected text
Selected text with [[Some meaningful document]].
```

### Conditional context
Usually you want to add context conditionally, use keywords `{{=CONTEXT_START=}}` and `{{=CONTEXT_END=}}` to wrap context.

```
# Task
{{=SELECTION=}}
{{=CONTEXT_START=}}

# Context
{{=CONTEXT=}}
{{=CONTEXT_END=}}

# Instructions
Do something with the selected text.
```

🔴 If context is not empty, the entire block will be added to the prompt.
```
# Task
Selected text with [[Some meaningful document]].

# Context
Some example context about the selected text from some meaningful document.

# Instructions
Do something with the selected text.
```

⭕️ If context is empty, the entire block will not be added to the prompt.
```
# Task
Selected text with [[Some meaningful document]].

# Instructions
Do something with the selected text.
```
### Caveats

Remember that both the selection and context will be added to the end of the prompt by default if you not specify custom places for them.
```
# Task
Some task.

# Instructions
Do something with the selected text.
```
Translates to:
```
# Task
Some task.

# Instructions
Do something with the selected text.

Selected text with [[Some meaningful document]].

Context:
Some example context about the selected text from some meaningful document.
```

# 结构化提示词模板中的特殊关键字

## 选择文本插入 - {{=SELECTION=}}
默认情况下，选中的文本会被添加到提示词的末尾。
例如：选中文本为 `示例文本` 且提示词为 `你是一个助手，帮助用户完成文档内容。`

最终提示词将是：
```
你是一个助手，帮助用户完成文档内容。

示例文本
```

要在特定位置插入选中的文本，使用 `{{=SELECTION=}}` 关键字：
```
{{=SELECTION=}}
你是一个助手，帮助用户完成文档内容。
```

转换为：
```
示例文本
你是一个助手，帮助用户完成文档内容。
```

## 上下文插入 - {{=CONTEXT=}}
默认情况下，上下文会被添加到提示词末尾，在默认的选择文本位置之后：
```
带有 [[一些有意义的文档]] 的选中文本。

上下文：
从一些有意义的文档中提取的关于选中文本的上下文示例。
```

### 自定义上下文位置
关键字 `{{=CONTEXT=}}` 将被替换为多行上下文字符串。
```
# 相关上下文
{{=CONTEXT=}}

# 选中文本
{{=SELECTION=}}
```

转换为：
```
# 相关上下文
从一些有意义的文档中提取的关于选中文本的上下文示例。

# 选中文本
带有 [[一些有意义的文档]] 的选中文本。
```

### 条件上下文
通常你希望根据条件添加上下文，使用关键字 `{{=CONTEXT_START=}}` 和 `{{=CONTEXT_END=}}` 包裹上下文内容。

```
# 任务
{{=SELECTION=}}
{{=CONTEXT_START=}}

# 上下文
{{=CONTEXT=}}
{{=CONTEXT_END=}}

# 指令
对选中的文本进行处理。
```

如果上下文不为空，整个块会被添加到提示词中：
```
# 任务
带有 [[一些有意义的文档]] 的选中文本。

# 上下文
从一些有意义的文档中提取的关于选中文本的上下文示例。

# 指令
对选中的文本进行处理。
```

如果上下文为空，整个块不会被添加到提示词中：
```
# 任务
带有 [[一些有意义的文档]] 的选中文本。

# 指令
对选中的文本进行处理。
```
### Caveats

Remember that both the selection and context will be added to the end of the prompt by default if you not specify custom places for them.
```
# Task
Some task.

# Instructions
Do something with the selected text.
```
Translates to:
```
# Task
Some task.

# Instructions
Do something with the selected text.

Selected text with [[Some meaningful document]].

Context:
Some example context about the selected text from some meaningful document.
```

# 时间信息 - {{=CURRENT_TIME=}}
使用 `{{=CURRENT_TIME=}}` 在提示词中插入当前时间：

```
现在的时间是{{=CURRENT_TIME=}}，请根据这个时间生成一个问候语。
```

转换为：
```
现在的时间是2024年06月17日 星期一 14:30:45，请根据这个时间生成一个问候语。
```

## 输出格式控制

### 控制模型信息显示 - {{=SHOW_MODEL_INFO=}}
使用 `{{=SHOW_MODEL_INFO=}}` 控制是否在输出中显示模型名称和时间戳信息：

```
{{=SHOW_MODEL_INFO=}}=false
翻译以下内容为英文：
```

当设置为false时，输出中不会包含模型名称和时间戳，只显示AI生成的内容。
默认值取决于全局设置中的"显示模型信息"选项。

### 控制性能数据显示 - {{=SHOW_PERFORMANCE=}}
使用 `{{=SHOW_PERFORMANCE=}}` 控制是否在输出中显示Token使用量和响应时间等性能指标：

```
{{=SHOW_PERFORMANCE=}}=false
总结以下内容：
```

当设置为false时，输出中不会包含Token使用量、生成速度和响应时间等性能指标。
默认值取决于全局设置中的"显示性能数据"选项。

### 同时控制两种信息
可以同时控制两种信息的显示：

```
{{=SHOW_MODEL_INFO=}}=false
{{=SHOW_PERFORMANCE=}}=false
写一篇关于AI的短文：
```

这样生成的内容将不包含任何元数据，只显示AI生成的纯文本内容。

如果想要同时显示两种信息，可以设置为true：

```
{{=SHOW_MODEL_INFO=}}=true
{{=SHOW_PERFORMANCE=}}=true
写一篇关于AI的短文：
```

这样生成的内容将同时包含模型信息和性能数据。

## 优先级规则
1. 如果在系统提示词(System prompt)中设置了控制参数，优先使用系统提示词中的设置
2. 如果系统提示词中没有设置，则使用用户提示词中的设置
3. 如果两者都没有设置，则使用全局设置中的默认值
