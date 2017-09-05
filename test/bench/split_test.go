package main

import (
	"strings"
	"testing"

	"github.com/gopherjs/gopherjs/js"
)

const txt = "asdasdasdsad.asdsadsadasd.asdasdsagafsfdg.f34frrewfcsdaf.sdaf34a.sadf.asdf4.saf"

var txts = []string{"asdasdasdsad", "asdsadsadasd", "asdasdsagafsfdg", "f34frrewfcsdaf", "sdaf34a", "sadf", "asdf4", "saf"}

func split(str string) []string {
	return strings.Split(str, ".")
}

func jsSplit(str string) (result []string) {
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

func TestEqualSplit(t *testing.T) {
	gos := split(txt)
	jss := jsSplit(txt)
	if len(gos) != len(jss) {
		t.Errorf("not equal split, %v js: %v", gos, jss)
	}
	for i := range gos {
		if gos[i] != jss[i] {
			t.Errorf("not equal split, %v js: %v", gos, jss)
		}
	}
}

func BenchmarkGoSplit(b *testing.B) {
	for n := 0; n < b.N; n++ {
		split(txt)
	}
}

func BenchmarkJSSplit(b *testing.B) {
	for n := 0; n < b.N; n++ {
		jsSplit(txt)
	}
}

func join(strs []string) string {
	return strings.Join(strs, ".")
}

func jsJoin(strs []string) string {
	return js.InternalObject(strs).Get("$array").Call("join", ".").String()
}

func TestEqualJoin(t *testing.T) {
	gos := join(txts)
	jss := jsJoin(txts)
	if gos != jss {
		t.Errorf("not equal split, %v js: %v", gos, jss)
	}
}

func BenchmarkGoJoin(b *testing.B) {
	for n := 0; n < b.N; n++ {
		join(txts)
	}
}

func BenchmarkJSJoin(b *testing.B) {
	for n := 0; n < b.N; n++ {
		jsJoin(txts)
	}
}
