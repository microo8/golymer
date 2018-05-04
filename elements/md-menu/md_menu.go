package mdmenu

import "github.com/microo8/golymer"

var mdMenuTemplate = golymer.NewTemplate(`
`)

//MdMenu is an material design menu
type MdMenu struct {
	golymer.Element
}

func newMdMenu() *MdMenu {
	l := new(MdMenu)
	l.SetTemplate(mdMenuTemplate)
	return l
}

func init() {
	golymer.MustDefine(newMdMenu)
}
