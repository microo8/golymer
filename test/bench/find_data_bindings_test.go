package main

import (
	"fmt"
	"regexp"
	"testing"
	"unicode"
)

const val = "iadbsiabvd ais [[xyz]] asdh asid [[rtsx]] jayhdasb [[asdasdasd.asdasd.asd]] uscvbduacbvusa sda fsdai bsdabf sdasdaifu sadif isdabf iksdjafb sadjnf kasnjdfj nsdakfjn skadnf [[sadasisadfbuydb fsudbfsdbhbfdsf]] asdsad sad sad sad sad sad as asjdb  sahdfb sidf bsidfb asib [[Absd.sa234]]"

var oneWayRegex = regexp.MustCompile(`\[\[([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\]\]`)

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

func main() {}
