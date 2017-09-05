package main

import (
	"fmt"
	"regexp"
	"strings"
	"testing"
	"unicode"

	"github.com/gopherjs/gopherjs/js"
)

func main() {}

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

func kebabToCamelCase(kebab string) (camelCase string) {
	isToUpper := false
	for _, runeValue := range kebab {
		if isToUpper {
			camelCase += strings.ToUpper(string(runeValue))
			isToUpper = false
			continue
		}
		if runeValue == '-' {
			isToUpper = true
		} else {
			camelCase += string(runeValue)
		}
	}
	return
}

var kebabRegex = js.Global.Get("RegExp").New("-([a-z])", "g")

func kebabMatch(g *js.Object) *js.Object {
	return g.Index(1).Call("toUpperCase")
}

func kebabToCamelCaseJS(kebab string) string {
	return js.InternalObject(kebab).Call("replace", kebabRegex, kebabMatch).String()
}

func TestKebabToCamelCase(t *testing.T) {
	want := kebabToCamelCase("my-awesome-element")
	got := kebabToCamelCaseJS("my-awesome-element")
	if want != got {
		t.Errorf("kebabToCamelCaseJS wrong output: %s", got)
	}
}
func BenchmarkKebabToCamelCase(b *testing.B) {
	for n := 0; n < b.N; n++ {
		_ = kebabToCamelCase("my-awesome-element")
	}
}

func BenchmarkKebabToCamelCaseJS(b *testing.B) {
	for n := 0; n < b.N; n++ {
		_ = kebabToCamelCaseJS("my-awesome-element")
	}
}

//string.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
var camelRegex = js.Global.Get("RegExp").New("([a-z])([A-Z])", "g")

func camelCaseToKebabJS(s string) string {
	return js.InternalObject(s).Call("replace", camelRegex, "$1-$2").Call("toLowerCase").String()
}

func camelCaseToKebab(s string) string {
	var result string
	var words []string
	var lastPos int
	rs := []rune(s)

	for i := 1; i < len(rs); i++ {
		if !unicode.IsUpper(rs[i]) {
			continue
		}
		if initialism := startsWithInitialism(s[lastPos:]); initialism != "" {
			words = append(words, initialism)
			i += len(initialism) - 1
			lastPos = i
			continue
		}
		words = append(words, s[lastPos:i])
		lastPos = i
	}

	// append the last word
	if s[lastPos:] != "" {
		words = append(words, s[lastPos:])
	}

	for k, word := range words {
		if k > 0 {
			result += "-"
		}
		result += strings.ToLower(word)
	}

	return result
}

// startsWithInitialism returns the initialism if the given string begins with it
func startsWithInitialism(s string) string {
	var initialism string
	// the longest initialism is 5 char, the shortest 2
	for i := 1; i <= 5; i++ {
		if len(s) > i-1 && commonInitialisms[s[:i]] {
			initialism = s[:i]
		}
	}
	return initialism
}

var commonInitialisms = map[string]bool{
	"ACL":   true,
	"API":   true,
	"ASCII": true,
	"CPU":   true,
	"CSS":   true,
	"DNS":   true,
	"EOF":   true,
	"GUID":  true,
	"HTML":  true,
	"HTTP":  true,
	"HTTPS": true,
	"ID":    true,
	"IP":    true,
	"JSON":  true,
	"LHS":   true,
	"OS":    true,
	"QPS":   true,
	"RAM":   true,
	"RHS":   true,
	"RPC":   true,
	"SLA":   true,
	"SMTP":  true,
	"SQL":   true,
	"SSH":   true,
	"TCP":   true,
	"TLS":   true,
	"TTL":   true,
	"UDP":   true,
	"UI":    true,
	"UID":   true,
	"UUID":  true,
	"URI":   true,
	"URL":   true,
	"UTF8":  true,
	"VM":    true,
	"XML":   true,
	"XMPP":  true,
	"XSRF":  true,
	"XSS":   true,
	"JS":    true,
	"MD":    true,
}

func TestCamelCaseToKebab(t *testing.T) {
	want := camelCaseToKebab("MyAwesomeElement")
	got := camelCaseToKebabJS("MyAwesomeElement")
	if want != got {
		t.Errorf("camelCaseToKebabJS wrong output: %s", got)
	}
}
func BenchmarkCamelCaseToKebab(b *testing.B) {
	for n := 0; n < b.N; n++ {
		_ = camelCaseToKebab("MyAwesomeElement")
	}
}

func BenchmarkCamelCaseToKebabJS(b *testing.B) {
	for n := 0; n < b.N; n++ {
		_ = camelCaseToKebabJS("MyAwesomeElement")
	}
}
