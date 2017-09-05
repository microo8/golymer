package main

import (
	"github.com/microo8/golymer"
	domrepeat "github.com/microo8/golymer/elements/dom-repeat"
	_ "github.com/microo8/golymer/elements/md-button"
)

type button struct {
	Text  string
	Color string
}

//in template the md-button-delegate element will be used as the delegate for stamping out the data
var repeatButtonsTemplate = golymer.NewTemplate(`
<dom-repeat id="repeat" delegate="md-button-delegate" items="{{Buttons}}"></dom-repeat>
`)

//RepeatButtons element that repeats the md-button-delegate elements with dom-repeat
type RepeatButtons struct {
	golymer.Element
	Buttons []*button //the items data to repeat
	repeat  *domrepeat.DomRepeat
}

func newRepeatButtons() *RepeatButtons {
	rb := new(RepeatButtons)
	rb.SetTemplate(repeatButtonsTemplate)
	rb.Buttons = []*button{
		&button{"click1", "red"},
		&button{"click2", "blue"},
		&button{"click3", "green"},
		&button{"click4", "yellow"},
	}
	return rb
}

var mdButtonDelegateTemplate = golymer.NewTemplate(`
<md-button style="--primary-color: [[Item.Color]];">[[Item.Text]]</md-button>
`)

//MdButtonDelegate wraps up the md-button element and sets it's text and color
type MdButtonDelegate struct {
	golymer.Element
	Item *button
}

func newMdButtonDelegate() *MdButtonDelegate {
	b := new(MdButtonDelegate)
	b.SetTemplate(mdButtonDelegateTemplate)
	return b
}

func init() {
	err := golymer.Define(newMdButtonDelegate)
	if err != nil {
		panic(err)
	}
	err = golymer.Define(newRepeatButtons)
	if err != nil {
		panic(err)
	}
}

func main() {}
