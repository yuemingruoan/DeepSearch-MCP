# googleSearch [原生格式]    

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1beta/models/gemini-2.5-flash:generateContent:
    post:
      summary: 'googleSearch [原生格式]    '
      deprecated: false
      description: 官方文档：https://ai.google.dev/gemini-api/docs/document-processing?hl=zh-cn
      tags:
        - 聊天(Chat)/谷歌Gemini 接口/原生格式
      parameters:
        - name: key
          in: query
          description: ''
          required: true
          example: '{{YOUR_API_KEY}}'
          schema:
            type: string
        - name: Content-Type
          in: header
          description: ''
          required: true
          example: application/json
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                contents:
                  type: array
                  items:
                    type: object
                    properties:
                      parts:
                        type: array
                        items:
                          type: object
                          properties:
                            inline_data:
                              type: object
                              properties:
                                mime_type:
                                  type: string
                                data:
                                  type: string
                              required:
                                - mime_type
                                - data
                            text:
                              type: string
              required:
                - contents
            example:
              contents:
                - role: user
                  parts:
                    - text: 今天重庆天气如何?
              tools:
                - googleSearch: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apifox-name: 成功
      security:
        - bearer: []
      x-apifox-folder: 聊天(Chat)/谷歌Gemini 接口/原生格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/5443236/apis/api-350446379-run
components:
  schemas: {}
  securitySchemes:
    bearer:
      type: http
      scheme: bearer
servers:
  - url: https://yunwu.ai
    description: 正式环境
security:
  - bearer: []

```
