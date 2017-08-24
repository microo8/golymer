# md-button element

Implementation of the [material design button](https://material.io/guidelines/components/buttons.html)

## usage

The material design button has the following properties:

- `Raised    bool` 
- `Disabled  bool`
- `Hidden    bool`
- `Elevation int`

## example

```go
import (
	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/md-button"
)

var template := golymer.NewTemplate(`
<style>
	--primary-color: #3F51B5;
</style>

<md-button elevation="2" on-click="ButtonClicked">click me!</md-button>
`)

type MyElem struct {
	golymer.Element
}

func newMyElem() *MyElem {
	e := new(MyElem)
	e.SetTemplate(template)
	return e
}

func (e *MyElem) ButtonClicked(event *golymer.Event) {
	print("Button Clicked!")
}

func init() {
	err := golymer.Define(newMyElem)
	if err != nil {
		panic(err)
	}
}
```

![md-button](https://raw.githubusercontent.com/microo8/golymer/master/elements/md-button/button.png)
