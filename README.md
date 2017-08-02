# golymer
Create HTML custom elements with go (gopherjs)

under construction

![Caution image](caution.png)

With golymer you can create your own HTML custom elements, just by registering an go struct. The innerHTML of the shadowDOM has authomatic data bindings.

```go
package main

import "github.com/microo8/golymer"

const myAwesomeTemplate = `
<style>
	:host {
		background-color: blue;
	}
</style>
<h1>[[FooAttr]]</h1>
<p>[[privateProperty]]</p>
<input type="text" value="{{BarAttr}}"/>
`

type MyAwesomeElement struct {
	golymer.Element
	FooAttr int
	BarAttr string
	privateProperty float64
}

func NewMyAwesomeElement() *MyAwesomeElement {
	e := new(MyAwesomeElement)
	e.Template = myAwesomeTemplate
	return e
}

func main() {
	err := golymer.Define(NewMyAwesomeElement)
	if err != nil {
		panic(err)
	}
}
```

Then just run `gopherjs build`, import the generated script to your html and you can use your new element

`<my-awesome-element foo-attr="1" bar-attr="hello"></my-awesome-element>`
