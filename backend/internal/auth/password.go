package auth

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

// dummyHash is checked when a login email doesn't exist, so response timing
// doesn't reveal which emails are registered.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("timing-equalizer"), bcryptCost)

func HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(h), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// BurnPasswordCheck spends the same time as a real CheckPassword call.
func BurnPasswordCheck(password string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
}
