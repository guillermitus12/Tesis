var express = require('express');
var app = express();
var router = express.Router();
var events = require('events');
var eventEmitter = new events.EventEmitter();

var bd=require('./db_connect/db');

var plotly = require('../private_modules/PlotlyGenerator');
var plotlyGenerator = new plotly();

/********************Uploads Datasets********************/
var fs = require("fs");
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));
var multer = require('multer');
var upload = multer({dest: './temp/'
    });
var path = require('path');

/**********************R-Script**********************/
var R = require("r-script")
var parseJSON = require('../private_modules/parseR/parseJSON');
var parser = new parseJSON();

/*router.get('/', function (req, res) {
    res.send('Welcome to RPS API');
 })*/
 //ANGULAR APP
app.get('/', function (req, res) {
    res.sendFile( "index.html" );
 })

 



 router.post("/uploadFile", upload.array("uploads[]", 12), function(req, res) {
    var ext = path.extname(req.files[0].originalname);
       if(ext !== '.tps' && ext !== '.nts' && ext !== '.txt') {
            console.log("archivo invalido");
            res.status(200).json( { "error": "Extension file invalid." });
       }
       else{
           console.log("desde el cliente: "+req.body.type_file);
                switch (req.body.type_file) {
                    case '1':
                        if(ext != '.tps'){
                            res.status(200).json( { "error": "Extension file not is correct." });
                            res.end();
                            return;
                        }  
                        break;
                    case '2':
                        if(ext != '.nts'){
                            res.status(200).json( { "error": "Extension file not is correct." });
                            res.end();
                            return;
                        }
                        break;
                    case '4':
                    case '3':
                        if(ext != '.txt'){
                            res.status(200).json( { "error": "Extension file not is correct." });
                            res.end();
                            return;
                        }
                        break;
                    
                }
              var stream = fs.createReadStream('./temp/'+req.files[0].filename).on('error',function(e){console.log(e);}).pipe(fs.createWriteStream('./public/datasets/'+req.files[0].originalname)).on('error',function(e){console.log(e);});
              stream.on('finish', function () {
                  //borramos el archivo temporal creado
                  fs.unlink('./temp/'+req.files[0].filename, function(e) {
                      console.log("success upload");
                      eventEmitter.emit('readFileR',req.files[0].originalname,req.body,res);
                  }); 
              });  
      }
});

router.get("/downloadTutorial", function(req,res,next){
    var data =fs.readFileSync('./RPS1.0UserGuide.pdf');
    res.contentType("application/pdf");
    res.send(data);
})

//Aca leo el archivo en R
var myEventHandler = function (nameFile,params,res) {
    console.log("Run -> Dataset loader");
    bd.query('SELECT 1 FROM dataset WHERE  project_id_ref = $1 AND dataset_name = $2 ;',[params.project_id,params.dataset_name], function(err, result){
        if(err){
          res.status(200).json( { "error": "Error in the connection with database." });
        }
        else{
            if(result.rowCount == 0){
    var path = "./public/datasets/".concat(nameFile);
    var out = R("r_scripts/loadDataset.R")
    .data({file : path, "type_file": params.type_file})
    .callSync();
   console.log("R Processing Finished.");
   dataParse = parser.OnlyParseDataR(out);
   console.log("Node js Processing Finished.");
   dataParse.project_id = params.project_id;
   dataParse.dataset_name = params.dataset_name;
   console.log(dataParse);
   dataParse.data.numbers_of_landmarks = dataParse.number_of_landmarks;
   dataParse.data.numbers_of_specimens = dataParse.number_of_objects;

   dataParse.data.root_number_landmarks = dataParse.numbers_of_landmarks;
   dataParse.data.root_number_specimens = dataParse.numbers_of_specimens;
   
            bd.query('INSERT INTO dataset values(DEFAULT,$1,$2,$3,$4,$5,$6,$7,$8,$9,null,0,0,null) RETURNING dataset_id',[params.project_id,params.dataset_name,nameFile,dataParse.numbers_of_specimens,dataParse.numbers_of_landmarks,dataParse.dimention,JSON.stringify(dataParse.data),JSON.stringify(dataParse.colors),JSON.stringify(dataParse.objects_name)], function(err, result){
                if(err){
                console.log(err);
                res.status(200).json( { "error": "Error in the connection with database." });
                }
                else{
                dataParse.dataset_id = result.rows[0].dataset_id;

                if(dataParse.dimention == 3){
                    dataParse.data_plotly =  plotlyGenerator.generateGraphicsPlotly3D(dataParse);
                    dataParse.layout = plotlyGenerator.getLayoutPlotly3D("3", dataParse.dataset_name);
                }else{
                    
                dataParse.data_plotly =  plotlyGenerator.generateGraphicsPlotly2D(dataParse);
                dataParse.layout = plotlyGenerator.getLayoutPlotly2D("3", dataParse.dataset_name);
                }

                console.log("Sending responce dataset loader.");
                res.status(200).json(JSON.stringify(dataParse));
                }

            });
        }else
        {
            res.status(200).json( { "error": "Already exist another dataset with the same name. Please change the dataset name." });
        }
        
    }});
}

//Assign the event handler to an event:
eventEmitter.on('readFileR', myEventHandler);

module.exports = router;