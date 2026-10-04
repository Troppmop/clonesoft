package learning

import "testing"

func TestParseRef(t *testing.T) {
	valid := map[string]string{
		"Genesis 1":          "tanakh",
		"Genesis 50":         "tanakh",
		"Song of Songs 8":    "tanakh",
		"Mishnah Berakhot 9": "mishnah",
		"Pirkei Avot 6":      "mishnah",
		"Berakhot 2a":        "bavli",
		"Berakhot 64a":       "bavli",
		"Tamid 33b":          "bavli",
	}
	for ref, corpus := range valid {
		if got, ok := ParseRef(ref); !ok || got != corpus {
			t.Errorf("ParseRef(%q) = %q, %v; want %q", ref, got, ok, corpus)
		}
	}
	for _, ref := range []string{
		"Genesis 0", "Genesis 51", "Genesis 1a", "Genesis 1:1", "Genesis", "genesis 1",
		"Berakhot 1b", "Berakhot 2", "Berakhot 65a", "Rashi on Genesis 1", "Mishnah Berakhot 10", "",
	} {
		if _, ok := ParseRef(ref); ok {
			t.Errorf("ParseRef(%q) accepted an invalid ref", ref)
		}
	}
}
