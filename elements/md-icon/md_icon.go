package mdicon

import (
	"strings"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

const mdIconsCSSURL = "https://fonts.googleapis.com/icon?family=Material+Icons"

//IconStyle is an enum for posible sizes of the md-icon
type IconStyle string

//posible icon sizes
const (
	IconSmall    IconStyle = "small"    //A smaller icon. 18px
	IconBig      IconStyle = "big"      //Bigger icon. 36px
	IconDouble   IconStyle = "double"   //Double-sized icon. 48px
	IconCircle   IconStyle = "circle"   //An icon in a circle
	IconSquare   IconStyle = "square"   //An icon in a square
	IconDarkBG   IconStyle = "dark-bg"  //An icon in dark background
	IconReactive IconStyle = "reactive" //An icon respond to click and showing a ripple effect
	IconDisabled IconStyle = "disabled" //A greyed out without responsiveness*
)

var mdIconTemplate = golymer.NewTemplate(`
<style>
@keyframes ce-ripple {
  0%   { transform: scale(0); }
  20%  { transform: scale(1); }
  100% { opacity: 0; transform: scale(2); }
}

:host {
  font-family: 'Material Icons';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  user-select: none;
  vertical-align: middle;
  cursor: pointer;
  color: var(--theme-text-color-0, white);
  background-size: cover;
}

:host(.small) i { font-size: 18px; }
:host(.big) i { font-size: 36px; }
:host(.double) i { font-size: 48px; }
:host(.circle) {border-radius: 50%; text-align: center;}
:host(.square) {border-radius: 10%; text-align: center;}

:host(.circle),
:host(.square) {width: 48px; height: 48px;} 
:host(.circle.small),
:host(.square.small) {width: 34px; height: 34px;} 
:host(.circle.big),
:host(.square.big) {width: 72px; height: 72px;} 

:host(.circle), 
:host(.square) { 
  background-color: var(--theme-color-500, #9e9e9e );
  color: var(--theme-color-0, #ffffff);
} 
:host(.circle.dark-bg), 
:host(.square.dark-bg) { 
  background-color: var(--theme-color-0, #ffffff);
  color: var(--theme-color-600, #757575);
}
:host(.circle.small) i ,
:host(.square.small) i  { line-height: 34px;} 
:host(.circle) i ,
:host(.square) i { line-height: 48px;} 
:host(.circle.big) i ,
:host(.square.big)   i  { line-height: 72px;} 

:host(.reactive):active:after { animation: ce-ripple .4s ease-out; }

:host(.disabled) { color: var(--theme-text-color-400, #b9b9b9); }

:host(.dark-bg) { color: var(--theme-text-color-100, #f5f5f5); }
:host(.dark-bg).disabled { color: var(--theme-text-color-600, #727272); }

:host(.reactive) { position: relative; }
:host(.reactive):active    { color: var(--theme-text-color-900, #202020); }
:host(.reactive):hover     { color: var(--theme-text-color-600, #727272); }
:host(.reactive.dark-bg):active    { color: var(--theme-text-color-0, #ffffff);   }
:host(.reactive.dark-bg):hover     { color: var(--theme-text-color-300, #c2c2c2); }
:host(.reactive):after {
  content: '';
  display: block;
  position: absolute;
  left: 50%;
  top: 50%;
  width: 60px;
  height: 60px;
  margin-left: -30px;
  margin-top: -30px;
  background: #3f51b5;
  border-radius: 100%;
  opacity: .6;
  visibility: hidden;
  transform: scale(0);
}
:host(.reactive):active:after { 
  visibility: visible;
  animation: ce-ripple .4s ease-out;
}
.material-icons {
  font-family: 'Material Icons';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}
</style>
<i id="icon" class="material-icons"></i>
`)

//MdIcon is an material design application bar element
type MdIcon struct {
	golymer.Element
	IconStyle IconStyle
	Img       string
	icon      *js.Object
}

func newMdIcon() *MdIcon {
	l := new(MdIcon)
	l.SetTemplate(mdIconTemplate)
	return l
}

//ObserverStyle adds new icon style
func (i *MdIcon) ObserverIconStyle(old, new string) {
	if old != "" {
		i.Get("classList").Call("remove", old)
	}
	if new != "" {
		i.Get("classList").Call("add", new)
	}
}

//ObserverImg changes icon when Img is changed
func (i *MdIcon) ObserverImg(old, new string) {
	if !strings.Contains(new, ".") {
		i.icon.Set("innerHTML", new)
		return
	}
	i.Get("style").Set("backgroundImage", "url("+new+")")
	i.icon.Set("innerHTML", "")
}

func init() {
	document := js.Global.Get("document")
	//if there is no link to material design icons css add one
	if document.Call("querySelector", "head link[href=\""+mdIconsCSSURL+"\"]") == nil {
		link := document.Call("createElement", "link")
		link.Call("setAttribute", "rel", "stylesheet")
		link.Call("setAttribute", "href", mdIconsCSSURL)
		document.Call("querySelector", "head").Call("appendChild", link)
	}
	golymer.MustDefine(newMdIcon)
}
