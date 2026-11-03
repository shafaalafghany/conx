package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
)

var (
	ErrInvalidCiphertext = errors.New("crypto: invalid ciphertext length or format")
	ErrDecryptionFailed  = errors.New("crypto: failed to decrypt payload")
)

// Vault handles AES-256-GCM encryption and decryption of secrets
type Vault struct {
	key []byte
}

// NewVault initializes a vault with a derived 32-byte master key
func NewVault(masterSecret string) *Vault {
	hasher := sha256.New()
	hasher.Write([]byte(masterSecret))
	return &Vault{
		key: hasher.Sum(nil),
	}
}

// Encrypt encrypts a plaintext string and returns a hex-encoded string containing [nonce + ciphertext]
func (v *Vault) Encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(v.key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a hex-encoded [nonce + ciphertext] string back into plaintext
func (v *Vault) Decrypt(encodedCiphertext string) (string, error) {
	data, err := hex.DecodeString(encodedCiphertext)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(v.key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", ErrInvalidCiphertext
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", ErrDecryptionFailed
	}

	return string(plaintext), nil
}
