(() => {
  const key = [41, 83, 17, 98, 7, 76, 35];
  const encoded = [71, 54, 124, 3, 115, 36, 13, 72, 59, 124, 7, 99, 125, 23, 105, 52, 124, 3, 110, 32, 13, 74, 60, 124];

  document.querySelectorAll("[data-email-contact]").forEach((button) => {
    button.addEventListener("click", () => {
      const address = encoded
        .map((value, index) => String.fromCharCode(value ^ key[index % key.length]))
        .join("");

      window.location.href = `mailto:${address}`;
    });
  });
})();
