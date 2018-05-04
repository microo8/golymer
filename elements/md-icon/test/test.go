package main

import (
	"github.com/microo8/golymer"
	mdicon "github.com/microo8/golymer/elements/md-icon"
)

func main() {}

var mdIconTestTemplate = golymer.NewTemplate(`
<style>
:host {
	--theme-color-500: coral;
	--theme-color-0: white;
	display: block;
	contain: content;
	margin: 0;
    position: relative;
	width: 100vw;
	height: 100vh;
	background-color: gray;
}
</style>
<md-icon id="icon" img="menu"></md-icon>
<md-icon img="menu" icon-style="small"></md-icon>
<md-icon img="menu" icon-style="big"></md-icon>
<md-icon img="menu" icon-style="double"></md-icon>
<md-icon img="menu" icon-style="circle"></md-icon>
<md-icon img="menu" icon-style="square"></md-icon>
<md-icon img="menu" icon-style="dark-bg"></md-icon>
<md-icon img="menu" icon-style="reactive"></md-icon>
<md-icon img="menu" icon-style="disabled"></md-icon>
<md-icon img="https://cdn3.iconfinder.com/data/icons/avatars-add-on-pack-2/48/v-37-512.png" icon-style="circle"></md-icon>
<md-icon img="https://cdn3.iconfinder.com/data/icons/avatars-add-on-pack-2/48/v-37-512.png" icon-style="square"></md-icon>
`)

//MdIconTest testing element for the md-app-bar
type MdIconTest struct {
	golymer.Element
	icon *mdicon.MdIcon
}

func newMdIconTest() *MdIconTest {
	lt := new(MdIconTest)
	lt.SetTemplate(mdIconTestTemplate)
	return lt
}

func init() {
	golymer.MustDefine(newMdIconTest)
}
