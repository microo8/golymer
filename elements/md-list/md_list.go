package mdlist

import (
	"github.com/microo8/golymer"
)

var mdListTemplate = golymer.NewTemplate(`
<style>
:host {
  display: block;
}
:host div {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 48px;
}
:host ::slotted(*) {
  flex: 1;
}
</style>
<div><slot></slot></div>
`)

//MdList is an material design list
type MdList struct {
	golymer.Element
}

func newMdList() *MdList {
	l := new(MdList)
	l.SetTemplate(mdListTemplate)
	return l
}

func init() {
	golymer.MustDefine(newMdList)
}
