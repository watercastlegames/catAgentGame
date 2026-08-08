<%@ Language="VBScript" CodePage="65001" %>
<%
' sidak.kr 미러용 릴레이 리버스 프록시.
' 게임(cloud transport)이 /autodev/GameCreator/catAgentGame/api/relay/* 를 부르면
' web.config rewrite 가 이 파일로 넘긴다(?p=<경로>&<원본쿼리>).
' 여기서 chatgpt.site 의 실제 릴레이 허브로 서버->서버 포워딩한다.
' 브라우저는 같은 오리진(sidak.kr)만 부르므로 CORS/혼합콘텐츠 문제가 없다.
Response.Buffer = True
Response.CodePage = 65001

Const RELAY_BASE = "https://agent-forest-raccoon.sminia82.chatgpt.site/api/relay/"

Dim relPath, qs, i, pairs, kv, key, extra, target
relPath = Request.QueryString("p") & ""

' 원본 쿼리에서 p 만 빼고 나머지를 그대로 이어붙인다.
extra = ""
qs = Request.ServerVariables("QUERY_STRING") & ""
pairs = Split(qs, "&")
For i = 0 To UBound(pairs)
    kv = pairs(i)
    key = kv
    If InStr(kv, "=") > 0 Then key = Left(kv, InStr(kv, "=") - 1)
    If key <> "p" And Len(kv) > 0 Then
        If extra = "" Then extra = kv Else extra = extra & "&" & kv
    End If
Next

target = RELAY_BASE & relPath
If extra <> "" Then target = target & "?" & extra

Dim http, method, ctype, auth, bodyBytes
method = UCase(Request.ServerVariables("REQUEST_METHOD") & "")
Set http = Server.CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.setTimeouts 5000, 15000, 15000, 60000
http.Open method, target, False

' Cloudflare 가 UA 없는 요청을 막을 수 있어 브라우저처럼 보낸다.
http.setRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
http.setRequestHeader "Accept", "application/json"

auth = Request.ServerVariables("HTTP_AUTHORIZATION") & ""
If auth <> "" Then http.setRequestHeader "Authorization", auth

If method = "POST" Or method = "PUT" Then
    ctype = Request.ServerVariables("HTTP_CONTENT_TYPE") & ""
    If ctype = "" Then ctype = "application/json; charset=utf-8"
    http.setRequestHeader "Content-Type", ctype
    Dim total
    total = Request.TotalBytes
    If total > 0 Then
        bodyBytes = Request.BinaryRead(total)
        http.Send bodyBytes
    Else
        http.Send ""
    End If
Else
    http.Send
End If

' 상태 코드와 본문을 그대로 흘려준다.
Response.Status = http.Status & " " & http.statusText
Response.ContentType = "application/json; charset=utf-8"
Response.AddHeader "Cache-Control", "no-store"
Response.BinaryWrite http.responseBody
Set http = Nothing
%>
