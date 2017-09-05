package golymer

import (
	"strings"
	"unicode"

	"github.com/gopherjs/gopherjs/js"
)

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

func toExportedFieldName(name string) string {
	return strings.Title(kebabToCamelCase(name))
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

// commonInitialisms, taken from
// https://github.com/golang/lint/blob/206c0f020eba0f7fbcfbc467a5eb808037df2ed6/lint.go#L731
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
