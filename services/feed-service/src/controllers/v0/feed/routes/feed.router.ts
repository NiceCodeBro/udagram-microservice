import {Router, Request, Response} from 'express';
import {FeedItem} from '../models/FeedItem';
import {NextFunction} from 'connect';
import * as jwt from 'jsonwebtoken';
import * as AWS from '../../../../aws';
import * as c from '../../../../config/config';

const router: Router = Router();

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  console.log("Feed Service requireAuth is called.");

  if (!req.headers || !req.headers.authorization) {
    console.log("Feed Service requireAuth --> No authorization headers.");
    return res.status(401).send({message: 'No authorization headers.'});
  }

  const tokenBearer = req.headers.authorization.split(' ');
  if (tokenBearer.length != 2) {
    console.log("Feed Service requireAuth --> Malformed token.");
    return res.status(401).send({message: 'Malformed token.'});
  }

  const token = tokenBearer[1];
  return jwt.verify(token, c.config.jwt.secret, (err, decoded) => {
    if (err) {
      console.log("Feed Service requireAuth --> Failed to authenticate.");
      return res.status(500).send({auth: false, message: 'Failed to authenticate.'});
    }
    return next();
  });
}

// Get all feed items
router.get('/', async (req: Request, res: Response) => {
  const items = await FeedItem.findAndCountAll({order: [['id', 'DESC']]});
  console.log("GET: feed/ is called.");

  items.rows.map((item) => {
    if (item.url) {
      item.url = AWS.getGetSignedUrl(item.url);
    }
  });
  res.send(items);
  console.log("GET: feed/ --> Feeds are sent to client.");
});

// Get a feed resource
router.get('/:id',
    async (req: Request, res: Response) => {
      const {id} = req.params;
      console.log("GET: feed/:id is called.");

      const item = await FeedItem.findByPk(id);
      res.send(item);
      console.log("GET: feed/:id --> A item is sent to client.");
    });

// Get a signed url to put a new item in the bucket
router.get('/signed-url/:fileName',
    requireAuth,
    async (req: Request, res: Response) => {
      const {fileName} = req.params;
      console.log("GET: feed/signed-url/:fileName is called.");
      const url = AWS.getPutSignedUrl(fileName);
      console.log("GET: feed/signed-url/:fileName --> AWS put url is created.");
      res.status(201).send({url: url});
      console.log("GET: feed/signed-url/:fileName --> AWS put url is sent to client.");
    });

// Create feed with metadata
router.post('/',
    requireAuth,
    async (req: Request, res: Response) => {
      const caption = req.body.caption;
      const fileName = req.body.url; // same as S3 key name
      console.log("POST: feed/ is called.");
      if (!caption) {
        console.log("POST: feed/--> Caption is required or malformed.");
        return res.status(400).send({message: 'Caption is required or malformed.'});
      }

      if (!fileName) {
        console.log("POST: feed/--> File url is required.");
        return res.status(400).send({message: 'File url is required.'});
      }

      const item = await new FeedItem({
        caption: caption,
        url: fileName,
      });

      const savedItem = await item.save();
      console.log("POST: feed/--> Item is saved.");
      savedItem.url = AWS.getGetSignedUrl(savedItem.url);
      console.log("POST: feed/--> AWS signed url is received.");
      res.status(201).send(savedItem);
      console.log("POST: feed/--> AWS signed url is sent to client.");
    });

export const FeedRouter: Router = router;
