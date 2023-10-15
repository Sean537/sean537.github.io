let canvas = document.getElementById("bg");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
canvas.style.zIndex = -1;
let ctx = canvas.getContext("2d");
document.body.appendChild(canvas);
let particles = [];
let pcount = 1000;
let actions = ["up"];
let action = 0;
document.body.addEventListener("click", function () {
  action++;
  action = action % actions.length;
});
class particle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.vx = Math.random();
  }
  update() {
    switch (actions[action]) {
      case "up":
        this.y -= this.vx * 3;
        if (this.y < 0) {
          this.y = canvas.height;
        }
        break;
    }
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, 1 + this.vx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255," + this.vx + ")";
    ctx.fill();
  }
}

function ani() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (particles.length < pcount) {
    particles.push(new particle());
  }
  for (let i in particles) {
    let p = particles[i];
    p.update();
    p.draw();
  }
}
setInterval(ani, 100 / 6);
