module microtome.slicer_job {

  /**
  * Class that actually handles the slicing job. Not reusable
  */
  export class HeadlessToZipSlicerJob {

    private readonly slicer: microtome.slicer.AdvancedSlicer;
    private renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, clearColor: 0x000000 });
    private canvasElement: HTMLCanvasElement = this.renderer.domElement;
    private raftThickness_mm: number = 0;
    // private raftZStep_mm: number = 0;
    private zStep_mm: number = 0;

    private z = 0;
    private sliceNum = 1;
    private startTime = Date.now();
    private zip = new JSZip();
    private handle: number = null;
    private resolve: Function = null;
    private reject: Function = null;
    private zipBlob: Promise<Blob> = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    })
    private readonly SLICE_TIME = 20;
    private cancelled = false;

    constructor(private scene: microtome.three_d.PrinterScene,
      private cfg: microtome.printer.PrinterConfig,
      private jobCfg: microtome.printer.PrintJobConfig) {
      let shellInset_mm = -1;
      let raftOutset_mm = jobCfg.raftOutset_mm || 0;
      let pixelWidthMM = this.scene.printVolume.width / cfg.projector.xRes_px;
      let pixelHeightMM = this.scene.printVolume.depth / cfg.projector.yRes_px;
      this.raftThickness_mm = this.jobCfg.raftThickness_mm;
      this.zStep_mm = (this.jobCfg.stepDistance_microns * this.jobCfg.stepsPerLayer) / 1000;
      this.renderer.setSize(cfg.projector.xRes_px, cfg.projector.yRes_px);
      this.canvasElement.style.width = `${cfg.projector.xRes_px}px`;
      this.canvasElement.style.height = `${cfg.projector.yRes_px}px`;
      this.canvasElement.width = cfg.projector.xRes_px;
      this.canvasElement.height = cfg.projector.yRes_px;
      this.slicer = new microtome.slicer.AdvancedSlicer(scene,
        pixelWidthMM,
        pixelHeightMM,
        this.raftThickness_mm,
        raftOutset_mm,
        shellInset_mm,
        this.renderer)
    }

    private doSlice() {
      // TODO Error accumulation
      this.z = this.zStep_mm * this.sliceNum;
      this.slicer.sliceAtToBlob(this.z, blob => {
        // console.log("SLICE!!!");
        this.zip.file(`${this.sliceNum}.png`, blob, { compression: "store" })
        this.sliceNum++;
        if (this.sliceNum % 20 == 0) {
          console.log(`Layer ${this.sliceNum}, height: ${this.z}`);
        }
        this.scheduleNextSlice();
      });
      ;
      // return this.zip.generateAsync({ type: "blob" });
      // TODO Need to generate zip after adding all files. Not quite right still
    }

    private scheduleNextSlice() {
      if (this.z <= this.scene.printVolume.height && !this.cancelled) {
        this.handle = setTimeout(this.doSlice.bind(this), this.SLICE_TIME);
      } else {
        if (this.handle) {
          clearTimeout(this.handle);
        }
        if (this.cancelled) {
          this.reject();
        } else {
          this.zip.generateAsync({ type: "blob" }).then(blob => this.resolve(blob));
        }
      }
    }

    /**
    * Cancel the slicing job. Will cause the promise returned by
    * execute to fail
    */
    cancel() {
      this.cancelled = true;
    }

    /**
    * Execute the slicing job
    */
    execute(validate: boolean = false): Promise<Blob> {
      let config = {
        job: this.jobCfg,
        printer: this.cfg
      }
      try {
        this.doSlice();
        // this.scheduleNextSlice();
      } catch (e) {
        this.reject(e);
      }
      return this.zipBlob;
      // // Store config
      // this.zip.file("config.json", JSON.stringify(config))
    }
  }
}
