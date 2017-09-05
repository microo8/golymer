package main

import (
	"fmt"
	"regexp"
	"strings"
	"testing"
	"unicode"

	"github.com/gopherjs/gopherjs/js"
)

const val = "iadbsiabvd ais [[xyz]] asdh asid [[rtsx]] jayhdasb [[asdasdasd.asdasd.asd]] uscvbduacbvusa sda fsdai bsdabf sdasdaifu sadif isdabf iksdjafb sadjnf kasnjdfj nsdakfjn skadnf [[sadasisadfbuydb fsudbfsdbhbfdsf]] asdsad sad sad sad sad sad as asjdb  sahdfb sidf bsidfb asib [[Absd.sa234]]"

var oneWayRegex = regexp.MustCompile(`\[\[([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\]\]`)
var oneWayRegexJS = js.Global.Get("RegExp").New("\\[\\[([A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*)\\]\\]", "g")

func oneWayFindAllJS(strValue string) []string {
	matches := js.InternalObject(strValue).Call("match", oneWayRegexJS)
	if matches.Length() == 0 {
		return nil
	}
	result := make([]string, matches.Length())
	for i := 0; i < matches.Length(); i++ {
		m := matches.Index(i).String()
		result[i] = m[2 : len(m)-2]
	}
	return result
}

func BenchmarkJS(b *testing.B) {
	for n := 0; n < b.N; n++ {
		oneWayFindAllJS(val)
	}
}

func BenchmarkRegex(b *testing.B) {
	for n := 0; n < b.N; n++ {
		oneWayRegex.FindAllStringSubmatch(val, -1)
	}
}

//oneWayFindAll finds all one way data bindings in an string (eg. [[property]])
func oneWayFindAll(strValue string) (result []string) {
	value := []rune(strValue)
	for i := 0; i < len(value); i++ {
		if value[i] != '[' {
			continue
		}
		if len(value) <= i+1 || value[i+1] != '[' {
			continue
		}
		if len(value) <= i+2 || !unicode.IsLetter(value[i+2]) {
			continue
		}
		for j := i + 3; j < len(value); j++ {
			if !unicode.IsLetter(value[j]) && !unicode.IsNumber(value[j]) && value[j] != '.' {
				if value[j] == ']' && len(value) > j+1 && value[j+1] == ']' {
					result = append(result, string(value[i+2:j]))
				}
				break
			}
		}
	}
	return
}

func BenchmarkFunc(b *testing.B) {
	for n := 0; n < b.N; n++ {
		oneWayFindAll(val)
	}
}

func TestEqual(t *testing.T) {
	regexpResult := oneWayRegex.FindAllStringSubmatch(val, -1)
	funcResult := oneWayFindAll(val)
	if len(regexpResult) != len(funcResult) {
		t.Log(regexpResult)
		t.Log(funcResult)
		t.Fatal("length dont match")
	}
	for i := range regexpResult {
		if false && regexpResult[1][i] != funcResult[i] {
			fmt.Println(regexpResult[1][i])
			fmt.Println(funcResult[i])
			t.Fatal(i)
		}
	}
}

var tmpTxt = "{{abc}} aisdb asidb iasd naisdn asid {{abc}} asidbasi bdias b {{abc}}"

func TestReplace(t *testing.T) {
	regExp := js.Global.Get("RegExp").New("{{abc}}", "g")
	if strings.Replace(tmpTxt, "{{abc}}", "TEST", -1) != js.InternalObject(tmpTxt).Call("replace", regExp, "TEST").String() {
		t.Errorf("replace not equal")
	}
}

//BenchmarkStrings benchmarks the strings package Replace function
func BenchmarkStrings(b *testing.B) {
	for n := 0; n < b.N; n++ {
		strings.Replace(tmpTxt, "{{abc}}", "TEST", -1)
	}
}

//BenchmarkBuildIn benchmarks the native String.prototype.replace function and conversion back to string
func BenchmarkBuildIn(b *testing.B) {
	for n := 0; n < b.N; n++ {
		regExp := js.Global.Get("RegExp").New("{{abc}}", "g")
		_ = js.InternalObject(tmpTxt).Call("replace", regExp, "TEST").String()
	}
}
func main() {}
