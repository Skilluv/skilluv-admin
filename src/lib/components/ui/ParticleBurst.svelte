<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		/** Nombre de particules */
		count?: number;
		/** Couleurs des particules (CSS) */
		colors?: string[];
		/** Durée en ms */
		duration?: number;
		/** Déclencher l'animation */
		trigger?: boolean;
	}

	let {
		count = 24,
		colors = ['#ea580c', '#f59e0b', '#fbbf24', '#fcd34d', '#fff'],
		duration = 800,
		trigger = false
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let active = $state(false);

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		size: number;
		color: string;
		life: number;
		maxLife: number;
		shape: 'circle' | 'diamond' | 'star';
	}

	$effect(() => {
		if (trigger && !active) {
			burst();
		}
	});

	function burst() {
		if (!canvas) return;
		active = true;

		const ctx = canvas.getContext('2d')!;
		if (!ctx) return;

		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width;
		canvas.height = rect.height;

		const cx = canvas.width / 2;
		const cy = canvas.height / 2;

		const particles: Particle[] = Array.from({ length: count }, () => {
			const angle = Math.random() * Math.PI * 2;
			const speed = 2 + Math.random() * 6;
			const shapes: ('circle' | 'diamond' | 'star')[] = ['circle', 'diamond', 'star'];
			return {
				x: cx,
				y: cy,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed - 2,
				size: 3 + Math.random() * 5,
				color: colors[Math.floor(Math.random() * colors.length)],
				life: 0,
				maxLife: duration * (0.6 + Math.random() * 0.4),
				shape: shapes[Math.floor(Math.random() * shapes.length)]
			};
		});

		const start = performance.now();

		function frame(now: number) {
			const elapsed = now - start;
			if (elapsed > duration) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				active = false;
				return;
			}

			ctx.clearRect(0, 0, canvas.width, canvas.height);

			for (const p of particles) {
				p.life = elapsed;
				if (p.life > p.maxLife) continue;

				p.x += p.vx;
				p.y += p.vy;
				p.vy += 0.12; // gravity
				p.vx *= 0.99;

				const progress = p.life / p.maxLife;
				const alpha = 1 - progress;
				const scale = 1 - progress * 0.5;

				ctx.save();
				ctx.globalAlpha = alpha;
				ctx.fillStyle = p.color;
				ctx.translate(p.x, p.y);

				if (p.shape === 'diamond') {
					const s = p.size * scale;
					ctx.beginPath();
					ctx.moveTo(0, -s);
					ctx.lineTo(s, 0);
					ctx.lineTo(0, s);
					ctx.lineTo(-s, 0);
					ctx.closePath();
					ctx.fill();
				} else if (p.shape === 'star') {
					const s = p.size * scale;
					ctx.beginPath();
					for (let i = 0; i < 5; i++) {
						const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
						const r = i % 2 === 0 ? s : s * 0.5;
						if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
						else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
					}
					ctx.closePath();
					ctx.fill();
				} else {
					ctx.beginPath();
					ctx.arc(0, 0, p.size * scale, 0, Math.PI * 2);
					ctx.fill();
				}

				ctx.restore();
			}

			requestAnimationFrame(frame);
		}

		requestAnimationFrame(frame);
	}
</script>

<canvas
	bind:this={canvas}
	class="pointer-events-none absolute inset-0 z-10"
	class:hidden={!active}
></canvas>
