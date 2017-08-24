package mdripple

import (
	"strconv"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

var rippleTemplate = golymer.NewTemplate(`
<style>
	:host {
		display: block; position: absolute;
		background: hsl(180, 40%, 80%);
		border-radius: 100%;
		transform: scale(0);
	}
	:host(.animate) {
		animation: ripple 0.35s linear;
	}
	@keyframes ripple {
		100% {opacity: 0; transform: scale(2.5);}
	}
</style>
`)

func init() {
	err := golymer.Define(newMdRipple)
	if err != nil {
		panic(err)
	}
}

//Add adds the material design ripple effect to provided custom element
func Add(element *golymer.Element) {
	ripple := golymer.CreateElement("md-ripple").(*MdRipple)
	ripple.parent = element
	element.Get("shadowRoot").Call("appendChild", ripple)
	element.Get("style").Set("overflow", "hidden")
	element.AddEventListener("click", ripple.Animate)
}

//MdRipple an element to use in material design elements for the ripple effect
type MdRipple struct {
	golymer.Element
	parent *golymer.Element
}

//newMdRipple creates new MdRipple element
func newMdRipple() *MdRipple {
	r := new(MdRipple)
	r.SetTemplate(rippleTemplate)
	return r
}

func max(x, y int) int {
	if x > y {
		return x
	}
	return y
}

//Animate starts the animation of the ripple
func (r *MdRipple) Animate(event *golymer.Event) {
	r.Get("classList").Call("remove", "animate")
	if r.Get("offsetHeight").Int() == 0 && r.Get("offsetWidth").Int() == 0 {
		d := max(r.parent.Get("offsetHeight").Int(), r.parent.Get("offsetWidth").Int())
		r.Get("style").Set("height", strconv.Itoa(d)+"px")
		r.Get("style").Set("width", strconv.Itoa(d)+"px")
	}

	rect := r.parent.Call("getBoundingClientRect")

	offsetTop := rect.Get("top").Int() + js.Global.Get("document").Get("body").Get("scrollTop").Int()
	offsetLeft := rect.Get("left").Int() + js.Global.Get("document").Get("body").Get("scrollLeft").Int()

	x := event.Get("pageX").Int() - offsetLeft - r.Get("offsetWidth").Int()/2
	y := event.Get("pageY").Int() - offsetTop - r.Get("offsetHeight").Int()/2

	r.Get("style").Set("top", strconv.Itoa(y)+"px")
	r.Get("style").Set("left", strconv.Itoa(x)+"px")
	r.Get("classList").Call("add", "animate")
}
