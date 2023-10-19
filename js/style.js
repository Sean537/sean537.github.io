const dock = document.querySelector(".dock");
const tabs = dock.querySelectorAll("li");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((tab) => {
      tab.classList.remove("active");
      tab.style.animation = "";
    });
    tab.classList.add("active");
    tab.style.animation = "bounce 1s infinite";
  });
});
