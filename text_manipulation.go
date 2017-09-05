package golymer

import (
	"github.com/gopherjs/gopherjs/js"
)

var kebabRegex = js.Global.Get("RegExp").New("-([a-z])", "g")

func kebabMatch(g *js.Object) *js.Object {
	return g.Index(1).Call("toUpperCase")
}

func kebabToCamelCase(kebab string) string {
	return js.InternalObject(kebab).Call("replace", kebabRegex, kebabMatch).String()
}

var camelRegex = js.Global.Get("RegExp").New("([a-z])([A-Z])", "g")

func camelCaseToKebab(s string) string {
	return js.InternalObject(s).Call("replace", camelRegex, "$1-$2").Call("toLowerCase").String()
}

func toExportedFieldName(name string) string {
	camelCase := kebabToCamelCase(name)
	return js.InternalObject(camelCase[0:1]).Call("toUpperCase").String() + camelCase[1:]
}

var oneWayRegex = js.Global.Get("RegExp").New("\\[\\[([A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*)\\]\\]", "g")

//oneWayFindAll finds all one way data bindings in an string (eg. [[property]])
func oneWayFindAll(strValue string) (result []string) {
	matches := js.InternalObject(strValue).Call("match", oneWayRegex)
	if matches == nil || matches.Length() == 0 {
		return
	}
	result = make([]string, matches.Length())
	for i := 0; i < matches.Length(); i++ {
		m := matches.Index(i).String()
		result[i] = m[2 : len(m)-2]
	}
	return result
}

func split(str string) (result []string) {
	s := js.InternalObject(str).Call("split", ".")
	if s.Length() == 0 {
		return
	}
	result = make([]string, s.Length())
	for i := 0; i < s.Length(); i++ {
		result[i] = s.Index(i).String()
	}
	return
}
