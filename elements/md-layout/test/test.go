package main

import (
	"github.com/microo8/golymer"
	mdlayout "github.com/microo8/golymer/elements/md-layout"
)

func main() {}

var mdLayoutTestTemplate = golymer.NewTemplate(`
<style>
:host {
	display: block;
	contain: content;
	margin: 0;
    position: relative;
	width: 100vw;
	height: 100vh;
}
ul {
	background-color: blue;
	height: 100%;
}
.header {
	background-color: red;
	height: 100%;
}
.content {
	background-color: gray;
}
</style>
<md-layout id="layout">
	<div class="header" slot="header" on-click="OpenDrawer">header</div>
	<ul slot="drawer">
		<li>test 1</li>
		<li>test 2</li>
		<li>test 3</li>
		<li>test 4</li>
		<li>test 5</li>
		<li>test 6</li>
	</ul>
	<div class="content" slot="content">
	Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum
	</div>
</md-layout>
`)

//MdLayoutTest testing element for the md-layout
type MdLayoutTest struct {
	golymer.Element
	layout *mdlayout.MdLayout
}

func (lt *MdLayoutTest) OpenDrawer(event *golymer.Event) {
	lt.layout.DrawerOpened = !lt.layout.DrawerOpened
}

func newMdLayoutTest() *MdLayoutTest {
	lt := new(MdLayoutTest)
	lt.SetTemplate(mdLayoutTestTemplate)
	return lt
}

func init() {
	err := golymer.Define(newMdLayoutTest)
	if err != nil {
		panic(err)
	}
}
