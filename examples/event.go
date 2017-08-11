package main

import "github.com/gopherjs/gopherjs/js"

type event struct {
	*js.Object
	Type   string                 `js:"type"`
	Detail map[string]interface{} `js:"detail"`
}

func main() {
	detail := js.Global.Get("Object").New()
	detail.Set("detail", map[string]interface{}{"foo": "bar"})
	jse := js.Global.Get("CustomEvent").New("custom-event", detail)
	print(jse)
	print(jse.Get("detail"))
	e := &event{Object: jse}
	print(e)
	print(e.Type)
	print(e.Detail)
}
